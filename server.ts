import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dolive_secure_session_secret_2026';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const MAX_UPLOAD_SIZE_BYTES = (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '500', 10)) * 1024 * 1024;

// Trust reverse proxy (essential for Render to correctly read client IP for rate limiting)
app.set('trust proxy', 1);

// Security Headers Middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// -----------------------------------------------------------------------------
// SECURE AUTHENTICATION & SESSION MANAGEMENT
// -----------------------------------------------------------------------------

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Generate server-authoritative 12-character daily key based on HMAC of date and secret
export function generateDailyKeyForDate(dateStr: string): string {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(`daily_key_${dateStr}`).digest('hex');
  const baseChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz';
  let key = '';
  for (let i = 0; i < 12; i++) {
    const byte = parseInt(hmac.substring(i * 4, i * 4 + 4), 16);
    key += baseChars[byte % baseChars.length];
  }
  return key;
}

// In-memory token store with auto-expiry
const activeTokens = new Map<string, { createdAt: number; expiresAt: number }>();

export function createSessionToken(): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24-hour validity
  const payload = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  const token = `${payload}.${sig}`;
  activeTokens.set(token, { createdAt: Date.now(), expiresAt });
  return { token, expiresAt };
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [createdStr, randomHex, expiresStr, sig] = parts;
  const payload = `${createdStr}.${randomHex}.${expiresStr}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return false;
  }
  const expiresAt = parseInt(expiresStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    activeTokens.delete(token);
    return false;
  }
  return true;
}

// Rate limiting for login attempts (10 failed attempts per 10 minutes per IP)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) {
    return false;
  }
  entry.count++;
  return true;
}

function clearRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

// Authentication Middleware for sensitive endpoints
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  if (verifySessionToken(token)) {
    next();
    return;
  }

  res.status(401).json({
    success: false,
    error: 'Unauthorized',
    message: 'Valid session required. Please authenticate with today\'s daily key.',
  });
}

// -----------------------------------------------------------------------------
// SSRF & URL VALIDATION
// -----------------------------------------------------------------------------

export function validateRemoteUrl(rawUrl: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Protocol must be http: or https:' };
    }

    const host = parsed.hostname.toLowerCase();

    // Check for loopback, localhost, and unspecified addresses
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]') {
      return { valid: false, reason: 'Localhost addresses are not permitted.' };
    }

    // Check cloud metadata services
    if (host === '169.254.169.254' || host === 'metadata.google.internal' || host.includes('metadata.internal')) {
      return { valid: false, reason: 'Cloud metadata addresses are blocked.' };
    }

    // Check private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const octet1 = parseInt(ipv4Match[1], 10);
      const octet2 = parseInt(ipv4Match[2], 10);
      if (octet1 === 10) return { valid: false, reason: 'Private IP ranges are blocked.' };
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return { valid: false, reason: 'Private IP ranges are blocked.' };
      if (octet1 === 192 && octet2 === 168) return { valid: false, reason: 'Private IP ranges are blocked.' };
      if (octet1 === 169 && octet2 === 254) return { valid: false, reason: 'Link-local IP ranges are blocked.' };
      if (octet1 === 0 || octet1 >= 224) return { valid: false, reason: 'Reserved IP ranges are blocked.' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed URL provided.' };
  }
}

// -----------------------------------------------------------------------------
// RTMP PRESETS & SENSITIVE DATA REDACTION
// -----------------------------------------------------------------------------

export const RTMP_PRESETS: Record<string, string> = {
  fb: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  yt: 'rtmps://a.rtmp.youtube.com:443/live2/',
  tiktok: 'rtmp://push-rtmp-l1-sg01.tiktokcdn.com/game/',
  twitch: 'rtmp://live.twitch.tv/app/',
  kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/',
  other: '',
};

export function redactSensitiveUrl(fullRtmpUrl: string): string {
  try {
    const lastSlash = fullRtmpUrl.lastIndexOf('/');
    if (lastSlash > 8) {
      return fullRtmpUrl.substring(0, lastSlash + 1) + '[REDACTED_STREAM_KEY]';
    }
    return '[REDACTED_RTMP_DESTINATION]';
  } catch {
    return '[REDACTED_RTMP_DESTINATION]';
  }
}

// -----------------------------------------------------------------------------
// GLOBAL STREAMING STATE
// -----------------------------------------------------------------------------

export type SessionState = 'IDLE' | 'STARTING' | 'LIVE' | 'STOPPING' | 'ERROR' | 'STOPPED';

interface ServerStreamState {
  sessionState: SessionState;
  isStreaming: boolean;
  isPaused: boolean;
  frame: number;
  fps: string;
  time: string;
  size: string;
  bitrate: string;
  speed: string;
  logs: Array<{ timestamp: string; level: 'info' | 'warn' | 'error' | 'success'; message: string }>;
  destinationRedacted: string;
  source: string;
  error: string | null;
  keepAliveUrl: string | null;
  lastPingTime: string | null;
  startedAt: string | null;
}

const streamState: ServerStreamState = {
  sessionState: 'IDLE',
  isStreaming: false,
  isPaused: false,
  frame: 0,
  fps: '0',
  time: '00:00:00',
  size: '0 kB',
  bitrate: '0 kbits/s',
  speed: '0',
  logs: [],
  destinationRedacted: '',
  source: '',
  error: null,
  keepAliveUrl: process.env.RENDER_EXTERNAL_URL || null,
  lastPingTime: null,
  startedAt: null,
};

let activeProcess: ChildProcessWithoutNullStreams | null = null;
let stopTimeout: NodeJS.Timeout | null = null;

function addServerLog(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  streamState.logs.push({ timestamp, level, message });
  if (streamState.logs.length > 200) {
    streamState.logs.shift();
  }
}

export function checkFFmpegInstalled(): boolean {
  try {
    return (
      fs.existsSync('/usr/bin/ffmpeg') ||
      fs.existsSync('/usr/local/bin/ffmpeg') ||
      fs.existsSync('/bin/ffmpeg')
    );
  } catch {
    return false;
  }
}

export function checkYtDlpInstalled(): boolean {
  try {
    return (
      fs.existsSync('/usr/local/bin/yt-dlp') ||
      fs.existsSync('/usr/bin/yt-dlp') ||
      fs.existsSync('/bin/yt-dlp')
    );
  } catch {
    return false;
  }
}

export interface StreamResolutionResult {
  success: boolean;
  streamUrl?: string;
  sourceType: 'direct' | 'ytdlp';
  title?: string;
  error?: string;
  isBotBlocked?: boolean;
}

export async function resolveStreamUrl(rawUrl: string): Promise<StreamResolutionResult> {
  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();

  // If it's already a direct media stream URL, use it directly
  const isDirectMedia =
    lower.includes('.m3u8') ||
    lower.includes('.mp4') ||
    lower.includes('.ts') ||
    lower.includes('.flv') ||
    lower.includes('.mkv') ||
    lower.startsWith('rtmp://') ||
    lower.startsWith('rtmps://');

  if (isDirectMedia) {
    return {
      success: true,
      streamUrl: trimmed,
      sourceType: 'direct',
    };
  }

  // If it's a web link (YouTube, Twitch, Facebook, Vimeo, etc.), try yt-dlp
  const hasYtDlp = checkYtDlpInstalled();
  if (!hasYtDlp) {
    return {
      success: false,
      sourceType: 'ytdlp',
      error:
        'Stream extractor (yt-dlp) is not installed on the server. Please provide a direct media URL (.m3u8 or .mp4) or upload your video file directly.',
    };
  }

  return new Promise((resolve) => {
    const cookiesPath = path.join(UPLOADS_DIR, 'cookies.txt');
    const ytDlpBin = fs.existsSync('/usr/local/bin/yt-dlp')
      ? '/usr/local/bin/yt-dlp'
      : 'yt-dlp';

    const args: string[] = [
      '--force-ipv4',
      '--no-warnings',
      '--extractor-args',
      'youtube:player_client=ios,android,web',
      '-g',
    ];

    if (fs.existsSync(cookiesPath)) {
      args.push('--cookies', cookiesPath);
    }

    if (fs.existsSync('/usr/local/bin/node')) {
      args.push('--js-runtimes', 'node:/usr/local/bin/node');
    }

    // Try best progressive format or HLS stream
    args.push('-f', 'b/best', trimmed);

    const child = spawn(ytDlpBin, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve({
        success: false,
        sourceType: 'ytdlp',
        error: 'Stream link resolution timed out after 25 seconds. YouTube bot protection may be blocking this link.',
        isBotBlocked: true,
      });
    }, 25000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('http://') || l.startsWith('https://'));

      if (code === 0 && lines.length > 0) {
        resolve({
          success: true,
          streamUrl: lines[0],
          sourceType: 'ytdlp',
        });
        return;
      }

      const fullErr = `${stderr} ${stdout}`;
      const isBotBlocked =
        fullErr.includes('Sign in to confirm you’re not a bot') ||
        fullErr.includes('Sign in to confirm that you\'re not a bot') ||
        fullErr.includes('LOGIN_REQUIRED');

      if (isBotBlocked) {
        resolve({
          success: false,
          sourceType: 'ytdlp',
          isBotBlocked: true,
          error:
            'YouTube BotGuard detected cloud server IP. Solution: 1) Paste the direct HLS (.m3u8) stream link, 2) Upload your YouTube cookies.txt in DoLive, or 3) Upload the MP4 video directly for 100% reliable 24/7 streaming without bans.',
        });
      } else {
        const cleanErr =
          stderr
            .split('\n')
            .filter((l) => l.includes('ERROR:'))
            .join(' ') ||
          stderr ||
          'Could not extract playable stream URL.';
        resolve({
          success: false,
          sourceType: 'ytdlp',
          error: cleanErr.replace(/ERROR:\s*/g, '').trim(),
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        sourceType: 'ytdlp',
        error: `Failed to execute stream resolver: ${err.message}`,
      });
    });
  });
}

// -----------------------------------------------------------------------------
// STORAGE & UPLOAD MANAGEMENT
// -----------------------------------------------------------------------------

const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Memory map of uploaded files: maps original filename and generated safe name to absolute path
const uploadedFilesMap = new Map<string, string>();

// Clean up old uploads older than 6 hours
function cleanOldUploads(): void {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const f of files) {
      const full = path.join(UPLOADS_DIR, f);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > 6 * 60 * 60 * 1000) {
          fs.unlinkSync(full);
        }
      } catch {
        // ignore individual file clean errors
      }
    }
  } catch {
    // ignore
  }
}

// Clean old files once on startup and every 2 hours
cleanOldUploads();
setInterval(cleanOldUploads, 2 * 60 * 60 * 1000);

// -----------------------------------------------------------------------------
// SYSTEM & KEEP-ALIVE MAINTENANCE
// -----------------------------------------------------------------------------

setInterval(() => {
  const targetUrl = streamState.keepAliveUrl || process.env.RENDER_EXTERNAL_URL;
  if (targetUrl) {
    const cleanUrl = targetUrl.replace(/\/$/, '');
    fetch(`${cleanUrl}/health`).catch(() => {});
  }
}, 7 * 60 * 1000);

// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

// Basic health check (Phase 6 requirement)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    isStreaming: streamState.isStreaming,
    sessionState: streamState.sessionState,
  });
});

// System readiness check
app.get('/api/readiness', (_req: Request, res: Response) => {
  const ffmpegOk = checkFFmpegInstalled();
  let diskOk = false;
  try {
    const testFile = path.join(UPLOADS_DIR, `.health_test_${Date.now()}`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    diskOk = true;
  } catch {
    diskOk = false;
  }

  res.status(ffmpegOk && diskOk ? 200 : 503).json({
    ready: ffmpegOk && diskOk,
    ffmpegInstalled: ffmpegOk,
    diskWritable: diskOk,
    memoryUsage: process.memoryUsage(),
    uploadsDirectory: UPLOADS_DIR,
  });
});

// Authentication: Get server-issued daily key for today
app.get('/api/auth/daily-key', (_req: Request, res: Response) => {
  const today = getTodayDateString();
  const key = generateDailyKeyForDate(today);
  res.json({
    success: true,
    date: today,
    key,
  });
});

// Authentication: Verify key and issue signed session token
app.post('/api/auth/login', (req: Request, res: Response) => {
  const clientIp = (req.ip || req.socket.remoteAddress || 'unknown').toString();

  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      success: false,
      error: 'Too many attempts',
      message: 'Too many failed attempts. Please try again after 10 minutes.',
    });
    return;
  }

  const { key } = req.body;
  if (!key || typeof key !== 'string') {
    res.status(400).json({ success: false, message: 'Key is required' });
    return;
  }

  const trimmed = key.trim();
  const today = getTodayDateString();
  const validDailyKey = generateDailyKeyForDate(today);
  const isValid =
    trimmed === validDailyKey ||
    (ADMIN_KEY.length > 0 && trimmed === ADMIN_KEY);

  if (!isValid) {
    res.status(401).json({
      success: false,
      error: 'Invalid key',
      message: 'The provided key is invalid or expired for today.',
    });
    return;
  }

  clearRateLimit(clientIp);
  const session = createSessionToken();
  res.json({
    success: true,
    token: session.token,
    expiresAt: session.expiresAt,
    message: 'Authentication successful',
  });
});

// Authentication: Validate active session
app.get('/api/auth/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const isValid = verifySessionToken(token);
  res.json({ authenticated: isValid });
});

// Authentication: Logout and invalidate session
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  if (token) {
    activeTokens.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// API: Set Keep-Alive URL dynamically
app.post('/api/keepalive/set-url', requireAuth, (req: Request, res: Response) => {
  const { url } = req.body;
  if (url && typeof url === 'string') {
    const validation = validateRemoteUrl(url.trim());
    if (!validation.valid) {
      res.status(400).json({ success: false, message: validation.reason });
      return;
    }
    streamState.keepAliveUrl = url.trim();
    addServerLog(`[Keep-Alive ⚡] Auto-ping URL set to: ${streamState.keepAliveUrl}`, 'info');
    res.json({ success: true, message: 'Keep-Alive URL configured successfully!' });
  } else {
    res.status(400).json({ success: false, message: 'Valid URL is required' });
  }
});

// API: Upload video file from client to server disk
app.post('/api/upload', requireAuth, (req: Request, res: Response) => {
  const rawFilename = (req.query.filename as string) || `video_${Date.now()}.mp4`;
  const ext = path.extname(rawFilename).toLowerCase();
  const allowedExtensions = ['.mp4', '.m4v', '.mkv', '.mov', '.flv', '.ts', '.webm', '.avi'];

  if (!allowedExtensions.includes(ext)) {
    res.status(400).json({
      success: false,
      message: `Unsupported file extension "${ext}". Allowed: ${allowedExtensions.join(', ')}`,
    });
    return;
  }

  // Prevent path traversal by generating random safe internal name
  const safeUniqueName = `upload_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
  const targetPath = path.join(UPLOADS_DIR, safeUniqueName);

  let uploadedBytes = 0;
  const writeStream = fs.createWriteStream(targetPath);

  req.on('data', (chunk: Buffer) => {
    uploadedBytes += chunk.length;
    if (uploadedBytes > MAX_UPLOAD_SIZE_BYTES) {
      req.pause();
      writeStream.destroy();
      try {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } catch {
        // ignore
      }
      res.status(413).json({
        success: false,
        message: `Upload exceeds maximum allowed limit of ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)} MB.`,
      });
    }
  });

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    if (res.headersSent) return;

    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size === 0) {
      try {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } catch {
        // ignore
      }
      res.status(400).json({ success: false, message: 'Uploaded file is empty.' });
      return;
    }

    const sizeMb = (fs.statSync(targetPath).size / (1024 * 1024)).toFixed(1);
    addServerLog(`[Upload] File received: ${path.basename(rawFilename)} -> ${safeUniqueName} (${sizeMb} MB)`, 'success');

    // Store in uploaded files map for fast resolution by both original name and safe name
    uploadedFilesMap.set(path.basename(rawFilename).toLowerCase(), targetPath);
    uploadedFilesMap.set(safeUniqueName.toLowerCase(), targetPath);

    res.json({
      success: true,
      filePath: targetPath,
      fileUrl: `/uploads/${safeUniqueName}`,
      serverFilename: safeUniqueName,
      originalFilename: path.basename(rawFilename),
      sizeBytes: fs.statSync(targetPath).size,
      message: 'Video file uploaded successfully to server storage!',
    });
  });

  writeStream.on('error', (err) => {
    if (!res.headersSent) {
      addServerLog(`[Upload Error] Failed to write file: ${err.message}`, 'error');
      res.status(500).json({ success: false, message: err.message });
    }
  });
});

// API: Resolve and validate media link via yt-dlp or direct probe
app.post('/api/stream/resolve', requireAuth, async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    res.status(400).json({ success: false, message: 'Valid stream URL is required.' });
    return;
  }

  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  const val = validateRemoteUrl(targetUrl);
  if (!val.valid) {
    res.status(400).json({ success: false, message: val.reason });
    return;
  }

  const result = await resolveStreamUrl(targetUrl);
  res.json(result);
});

// API: Manage YouTube cookies (to bypass datacenter IP bot detection on Render/VPS)
app.post('/api/youtube/cookies', requireAuth, (req: Request, res: Response) => {
  const { cookiesContent } = req.body;
  if (!cookiesContent || typeof cookiesContent !== 'string' || !cookiesContent.trim()) {
    res.status(400).json({ success: false, message: 'Cookies text content is required.' });
    return;
  }

  try {
    const cookiesPath = path.join(UPLOADS_DIR, 'cookies.txt');
    fs.writeFileSync(cookiesPath, cookiesContent.trim(), 'utf-8');
    addServerLog(`[YouTube Cookies 🍪] cookies.txt updated successfully (${cookiesContent.length} bytes).`, 'success');
    res.json({ success: true, message: 'YouTube cookies saved! yt-dlp can now use your session to bypass bot checks.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Failed to save cookies: ${err.message}` });
  }
});

app.get('/api/youtube/cookies', (_req: Request, res: Response) => {
  const cookiesPath = path.join(UPLOADS_DIR, 'cookies.txt');
  const exists = fs.existsSync(cookiesPath);
  res.json({
    hasCookies: exists,
    sizeBytes: exists ? fs.statSync(cookiesPath).size : 0,
  });
});

app.delete('/api/youtube/cookies', requireAuth, (_req: Request, res: Response) => {
  const cookiesPath = path.join(UPLOADS_DIR, 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    fs.unlinkSync(cookiesPath);
    addServerLog(`[YouTube Cookies] cookies.txt removed.`, 'info');
  }
  res.json({ success: true, message: 'YouTube cookies removed.' });
});

// API: Current stream status
app.get('/api/stream/status', (_req: Request, res: Response) => {
  res.json({
    ...streamState,
    isRealFFmpegRunning: activeProcess !== null,
    hasYtDlp: checkYtDlpInstalled(),
    hasYouTubeCookies: fs.existsSync(path.join(UPLOADS_DIR, 'cookies.txt')),
  });
});

// API: Start Real FFmpeg Livestream
app.post('/api/stream/start', requireAuth, async (req: Request, res: Response) => {
  const {
    videoSource,
    videoFilePath,
    videoUrl,
    rtmpChoice,
    customRtmpUrl,
    streamKey,
    repeat,
    qualityPreset,
  } = req.body;

  if (activeProcess) {
    addServerLog(`[Server Engine] Terminating previous FFmpeg process before starting new broadcast...`, 'warn');
    try {
      activeProcess.kill('SIGKILL');
    } catch {
      // ignore
    }
    activeProcess = null;
  }

  const baseRtmp = rtmpChoice === 'other' ? customRtmpUrl : RTMP_PRESETS[rtmpChoice];
  if (!baseRtmp || typeof baseRtmp !== 'string') {
    res.status(400).json({ success: false, message: 'Invalid or unsupported RTMP destination URL.' });
    return;
  }

  if (!streamKey || typeof streamKey !== 'string' || !streamKey.trim()) {
    res.status(400).json({ success: false, message: 'Stream Key is required to broadcast.' });
    return;
  }

  let inputSource = videoSource === 'file' ? videoFilePath : videoUrl;
  if (!inputSource || typeof inputSource !== 'string' || !inputSource.trim()) {
    res.status(400).json({ success: false, message: 'Video input source is required.' });
    return;
  }

  inputSource = inputSource.trim();

  // Validate Local File Source
  if (videoSource === 'file') {
    let resolvedPath = inputSource;
    const baseName = path.basename(inputSource).toLowerCase();

    // Check if filename was recorded in uploadedFilesMap
    if (uploadedFilesMap.has(baseName)) {
      resolvedPath = uploadedFilesMap.get(baseName)!;
    } else if (!path.isAbsolute(resolvedPath)) {
      resolvedPath = path.join(UPLOADS_DIR, path.basename(resolvedPath));
    }

    // Secondary fallback: find any uploaded file matching base name
    if (!fs.existsSync(resolvedPath) && fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR);
      const nameWithoutExt = path.parse(baseName).name.toLowerCase();
      const match = files.find((f) => f.toLowerCase().includes(nameWithoutExt));
      if (match) {
        resolvedPath = path.join(UPLOADS_DIR, match);
      }
    }

    if (!fs.existsSync(resolvedPath)) {
      res.status(400).json({
        success: false,
        message: `Video file "${path.basename(inputSource)}" not found on server. Please click "Browse Video File" and wait for upload to complete (100%).`,
      });
      return;
    }

    // Prevent directory escape
    const normalizedUploads = path.resolve(UPLOADS_DIR);
    const normalizedFile = path.resolve(resolvedPath);
    if (!normalizedFile.startsWith(normalizedUploads)) {
      res.status(403).json({ success: false, message: 'Access denied: invalid file path.' });
      return;
    }

    inputSource = normalizedFile;
  } else {
    // If URL has no protocol scheme, default to https://
    if (!inputSource.startsWith('http://') && !inputSource.startsWith('https://')) {
      inputSource = `https://${inputSource}`;
    }

    // Validate Remote Video URL against SSRF and illegal protocols
    const urlValidation = validateRemoteUrl(inputSource);
    if (!urlValidation.valid) {
      res.status(400).json({ success: false, message: `Invalid video URL: ${urlValidation.reason}` });
      return;
    }

    addServerLog(`[Stream Resolver 🔍] Resolving playable media stream from: ${inputSource}...`, 'info');
    const resolution = await resolveStreamUrl(inputSource);

    if (!resolution.success) {
      addServerLog(`[Stream Resolver Error] ${resolution.error}`, 'error');
      res.status(400).json({
        success: false,
        message: resolution.error,
        isBotBlocked: resolution.isBotBlocked,
        sourceType: resolution.sourceType,
      });
      return;
    }

    inputSource = resolution.streamUrl!;
    addServerLog(
      `[Stream Resolver 🎯] Stream source resolved successfully (${resolution.sourceType === 'ytdlp' ? 'Extracted via yt-dlp' : 'Direct media URL'})`,
      'success'
    );
  }

  const cleanBase = baseRtmp.endsWith('/') ? baseRtmp : `${baseRtmp}/`;
  const fullRtmpDestination = `${cleanBase}${streamKey.trim()}`;
  const redactedDestination = redactSensitiveUrl(fullRtmpDestination);

  // Reset telemetry state
  streamState.sessionState = 'STARTING';
  streamState.isStreaming = true;
  streamState.isPaused = false;
  streamState.frame = 0;
  streamState.fps = '0';
  streamState.time = '00:00:00';
  streamState.size = '0 kB';
  streamState.bitrate = '0 kbits/s';
  streamState.speed = '0';
  streamState.destinationRedacted = redactedDestination;
  streamState.source = videoSource === 'file' ? path.basename(inputSource) : inputSource;
  streamState.error = null;
  streamState.logs = [];
  streamState.startedAt = new Date().toISOString();

  addServerLog(`[Server Engine] Starting FFmpeg broadcast pipeline...`, 'info');
  addServerLog(`[Input Source] ${streamState.source}`, 'info');
  addServerLog(`[Destination] ${redactedDestination}`, 'info');

  const ffmpegArgs: string[] = [];

  const isLiveStream =
    inputSource.includes('.m3u8') ||
    inputSource.includes('live_broadcast') ||
    inputSource.includes('hls_playlist') ||
    inputSource.includes('manifest');

  // Loop infinitely only for static files/videos (NEVER for live streams, which are already continuous)
  if (repeat && !isLiveStream) {
    ffmpegArgs.push('-stream_loop', '-1');
  }

  // Network resilience flags for remote video URLs
  if (inputSource.startsWith('http://') || inputSource.startsWith('https://')) {
    ffmpegArgs.push(
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5'
    );
    // Only reconnect at EOF for static VOD files, not ongoing live streams
    if (!isLiveStream) {
      ffmpegArgs.push('-reconnect_at_eof', '1');
    }
  }

  // Pre-input pacing and queueing to avoid packet drops
  ffmpegArgs.push('-thread_queue_size', '2048');
  if (!isLiveStream) {
    ffmpegArgs.push('-re');
  }
  ffmpegArgs.push('-fflags', '+genpts');

  // Input file
  ffmpegArgs.push('-i', inputSource);

  // Synchronization flags across loops to prevent frame drops and timestamp drift
  ffmpegArgs.push(
    '-avoid_negative_ts', 'make_zero',
    '-vsync', '1'
  );

  // Map primary video and audio stream safely (prevents FLV multiplex error on multi-stream HLS/MP4)
  ffmpegArgs.push('-map', '0:v:0?', '-map', '0:a:0?');

  // Quality & Encoding configurations
  // NOTE: YouTube Live strictly enforces 2-second keyframes (-g 60 for 30fps).
  if (qualityPreset === 'fhd') {
    // 1080p Full HD (6,000 Kbps) - High CPU / Dedicated Servers
    ffmpegArgs.push(
      '-sws_flags', 'fast_bilinear',
      '-vf', "scale='min(1920,iw)':-2",
      '-r', '30',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-threads', '2',
      '-pix_fmt', 'yuv420p',
      '-b:v', '6000k',
      '-minrate', '5500k',
      '-maxrate', '6500k',
      '-bufsize', '12000k',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '44100',
      '-ac', '2'
    );
  } else if (qualityPreset === 'hd') {
    // 720p HD (3,000 Kbps) - YouTube 720p Standard
    ffmpegArgs.push(
      '-sws_flags', 'fast_bilinear',
      '-vf', "scale='min(1280,iw)':-2",
      '-r', '30',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-threads', '2',
      '-pix_fmt', 'yuv420p',
      '-b:v', '3000k',
      '-minrate', '2800k',
      '-maxrate', '3200k',
      '-bufsize', '6000k',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2'
    );
  } else if (qualityPreset === 'eco') {
    // 720p Eco (1,800 Kbps) - Low bandwidth saver
    ffmpegArgs.push(
      '-sws_flags', 'fast_bilinear',
      '-vf', "scale='min(1280,iw)':-2",
      '-r', '30',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-threads', '2',
      '-pix_fmt', 'yuv420p',
      '-b:v', '1800k',
      '-minrate', '1600k',
      '-maxrate', '2000k',
      '-bufsize', '3600k',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ar', '44100',
      '-ac', '2'
    );
  } else if (qualityPreset === 'ultra') {
    // Ultra Direct Copy: 0% CPU overhead - BEST for Render free tier & zero buffering
    ffmpegArgs.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100'
    );
  } else {
    // Balanced Default: 1080p Standard (4,500 Kbps)
    ffmpegArgs.push(
      '-sws_flags', 'fast_bilinear',
      '-vf', "scale='min(1920,iw)':-2",
      '-r', '30',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-threads', '2',
      '-pix_fmt', 'yuv420p',
      '-b:v', '4500k',
      '-minrate', '4000k',
      '-maxrate', '5000k',
      '-bufsize', '9000k',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2'
    );
  }

  // Output format and flags
  ffmpegArgs.push(
    '-max_muxing_queue_size', '4096',
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',
    fullRtmpDestination
  );

  // Log safe command without leaking stream key
  const safeArgs = ffmpegArgs.map((arg) => (arg === fullRtmpDestination ? redactedDestination : arg));
  addServerLog(`[Command] ffmpeg ${safeArgs.join(' ')}`, 'info');

  try {
    const proc = spawn('ffmpeg', ffmpegArgs);
    activeProcess = proc;

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) addServerLog(line, 'info');
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse real-time live FFmpeg telemetry
        if (trimmed.includes('frame=')) {
          const frameMatch = trimmed.match(/frame=\s*(\d+)/);
          const fpsMatch = trimmed.match(/fps=\s*([\d.]+)/);
          const timeMatch = trimmed.match(/time=\s*([\d:.]+)/);
          const sizeMatch = trimmed.match(/size=\s*(\d+[kKmMbB]+)/);
          const bitrateMatch = trimmed.match(/bitrate=\s*([\d.]+kbits\/s)/);
          const speedMatch = trimmed.match(/speed=\s*([\d.]+)x/);

          if (frameMatch) {
            streamState.frame = parseInt(frameMatch[1], 10);
            if (streamState.frame > 5 && streamState.sessionState === 'STARTING') {
              streamState.sessionState = 'LIVE';
            }
          }
          if (fpsMatch) streamState.fps = fpsMatch[1];
          if (timeMatch) streamState.time = timeMatch[1].split('.')[0];
          if (sizeMatch) streamState.size = sizeMatch[1];
          if (bitrateMatch) streamState.bitrate = bitrateMatch[1];
          if (speedMatch) {
            streamState.speed = `${speedMatch[1]}x`;
            const speedVal = parseFloat(speedMatch[1]);
            if (speedVal < 0.85 && streamState.frame > 30 && streamState.frame % 90 === 0) {
              addServerLog(
                `⚠️ Low Server CPU Speed (${speedMatch[1]}x): Broadcast is running slower than 1.0x realtime. Viewers may experience buffering. Switch Stream Quality to 'Fast Direct Stream (0% CPU)' for smooth playback!`,
                'warn'
              );
            }
          }

          // Live telemetry log every ~30 frames (~1 second)
          if (streamState.frame > 0 && streamState.frame % 30 === 0) {
            addServerLog(
              `[Live Stream] frame=${streamState.frame} | fps=${streamState.fps} | time=${streamState.time} | bitrate=${streamState.bitrate} | speed=${streamState.speed}`,
              'info'
            );
          }
        } else if (trimmed.includes('Stream mapping:')) {
          streamState.sessionState = 'LIVE';
          addServerLog(`[Handshake] RTMP Server Connection Accepted! Stream mapping OK.`, 'success');
        } else if (trimmed.includes('Output #0') || trimmed.includes('Stream #0') || trimmed.includes('Input #0')) {
          addServerLog(`[FFmpeg] ${trimmed}`, 'info');
        } else if (
          trimmed.includes('Error in the pull function') ||
          (trimmed.includes('Input/output error') && (trimmed.includes('rtmp') || trimmed.includes('tls'))) ||
          trimmed.includes('Connection reset by peer') ||
          trimmed.includes('Broken pipe') ||
          trimmed.includes('handshake failed')
        ) {
          addServerLog(`[RTMP Rejection ❌] Streaming server rejected connection: Stream Key is invalid, expired, or inactive.`, 'error');
          streamState.error = `YouTube RTMP rejected your Stream Key. Please ensure you copied your active Stream Key from YouTube Studio (studio.youtube.com > Go Live). If testing, click '🧪 Demo Stream Key' to preview locally.`;
        } else if (trimmed.includes('Error') || trimmed.includes('Connection refused') || trimmed.includes('Server error') || trimmed.includes('failed')) {
          addServerLog(`[Error] ${trimmed}`, 'error');
          if (!streamState.error) {
            streamState.error = trimmed;
          }
        } else if (trimmed.includes('Opening') || trimmed.includes('Duration:') || trimmed.includes('Metadata:')) {
          addServerLog(`[FFmpeg] ${trimmed}`, 'info');
        }
      }
    });

    proc.on('close', (code) => {
      if (stopTimeout) {
        clearTimeout(stopTimeout);
        stopTimeout = null;
      }

      if (code !== 0) {
        addServerLog(
          `[Process] FFmpeg process exited with code ${code}. Check stream key and ensure video source is valid.`,
          'error'
        );
        if (
          !streamState.error ||
          streamState.error.includes('Error in the pull function') ||
          streamState.error.includes('Input/output error') ||
          streamState.frame === 0
        ) {
          const isSuspectedDummyKey =
            streamKey.startsWith('live_') ||
            streamKey.startsWith('demo_') ||
            streamKey.includes('_stream') ||
            streamKey.length < 10 ||
            streamKey.includes('•');
          streamState.error = isSuspectedDummyKey
            ? `RTMP server rejected the stream key. For real broadcasting, obtain your real stream key from YouTube Studio (studio.youtube.com > Go Live). Or use Demo Mode in DoLive to test locally without a real key.`
            : `YouTube RTMP server disconnected during handshake (Exit code ${code}). Please verify your Stream Key in YouTube Studio (studio.youtube.com > Go Live). For testing, use Demo Mode.`;
        }
        streamState.sessionState = 'ERROR';
      } else {
        addServerLog(`[Process] FFmpeg process exited cleanly.`, 'info');
        streamState.sessionState = 'STOPPED';
      }

      activeProcess = null;
      streamState.isStreaming = false;
    });

    proc.on('error', (err) => {
      addServerLog(`[Process Error] Failed to launch FFmpeg: ${err.message}`, 'error');
      activeProcess = null;
      streamState.isStreaming = false;
      streamState.sessionState = 'ERROR';
      streamState.error = err.message;
    });

    res.json({
      success: true,
      sessionState: streamState.sessionState,
      message: 'Real FFmpeg broadcast pipeline started on server!',
    });
  } catch (err: any) {
    activeProcess = null;
    streamState.isStreaming = false;
    streamState.sessionState = 'ERROR';
    streamState.error = err.message;
    res.status(500).json({ success: false, message: `Failed to launch FFmpeg: ${err.message}` });
  }
});

// API: Stop Real FFmpeg Livestream
app.post('/api/stream/stop', requireAuth, (_req: Request, res: Response) => {
  streamState.sessionState = 'STOPPING';

  if (activeProcess) {
    const pid = activeProcess.pid;
    addServerLog(`[Server Engine] Sending graceful SIGINT to FFmpeg PID ${pid}...`, 'warn');
    activeProcess.kill('SIGINT');

    stopTimeout = setTimeout(() => {
      if (activeProcess) {
        addServerLog(`[Server Engine] Forcing SIGKILL on FFmpeg PID ${pid}...`, 'warn');
        activeProcess.kill('SIGKILL');
        activeProcess = null;
      }
    }, 2000);
  }

  streamState.isStreaming = false;
  streamState.sessionState = 'STOPPED';
  addServerLog(`[Server Engine] Livestream stopped cleanly.`, 'success');
  res.json({ success: true, sessionState: 'STOPPED', message: 'Livestream stopped.' });
});

// Clean up child process on server exit/restart
function handleProcessShutdown(signal: string): void {
  console.log(`[DoLive] Received ${signal}. Cleaning up child processes...`);
  if (activeProcess) {
    try {
      activeProcess.kill('SIGKILL');
    } catch {
      // ignore
    }
    activeProcess = null;
  }
  process.exit(0);
}

process.on('SIGTERM', () => handleProcessShutdown('SIGTERM'));
process.on('SIGINT', () => handleProcessShutdown('SIGINT'));

// -----------------------------------------------------------------------------
// STATIC ASSET SERVING & DEV INTEGRATION
// -----------------------------------------------------------------------------

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');

  if (isProduction && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // Express 5 catch-all middleware for client-side SPA routing
    app.use((_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DoLive Full-Stack Server running at http://0.0.0.0:${PORT}`);
    console.log(`🎬 FFmpeg binary detected: ${checkFFmpegInstalled() ? 'YES (/usr/bin/ffmpeg)' : 'NO'}`);
    console.log(`🔒 Authentication: Server-Side Daily Key (HMAC Protected)`);
  });

  return server;
}

export default app;

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
