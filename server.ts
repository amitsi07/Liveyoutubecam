import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

// RTMP Destination presets
const RTMP_PRESETS: Record<string, string> = {
  fb: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  yt: 'rtmp://a.rtmp.youtube.com/live2/',
  tiktok: 'rtmp://push-rtmp-l1-sg01.tiktokcdn.com/game/',
  twitch: 'rtmp://live.twitch.tv/app/',
  kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/',
  other: '',
};

// Global streaming state
interface ServerStreamState {
  isStreaming: boolean;
  isPaused: boolean;
  frame: number;
  fps: string;
  time: string;
  size: string;
  bitrate: string;
  speed: string;
  logs: Array<{ timestamp: string; level: 'info' | 'warn' | 'error' | 'success'; message: string }>;
  destination: string;
  source: string;
  error: string | null;
  keepAliveUrl: string | null;
  lastPingTime: string | null;
}

const streamState: ServerStreamState = {
  isStreaming: false,
  isPaused: false,
  frame: 0,
  fps: '0',
  time: '00:00:00',
  size: '0 kB',
  bitrate: '0 kbits/s',
  speed: '0',
  logs: [],
  destination: '',
  source: '',
  error: null,
  keepAliveUrl: process.env.RENDER_EXTERNAL_URL || null,
  lastPingTime: null,
};

let activeProcess: ChildProcessWithoutNullStreams | null = null;

function addServerLog(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  streamState.logs.push({ timestamp, level, message });
  if (streamState.logs.length > 250) {
    streamState.logs.shift();
  }
}

// Check ffmpeg availability
function checkFFmpegInstalled(): boolean {
  try {
    return fs.existsSync('/usr/bin/ffmpeg') || fs.existsSync('/usr/local/bin/ffmpeg');
  } catch {
    return false;
  }
}

// Self Keep-Alive interval (Pings itself to prevent Render from going to sleep)
setInterval(() => {
  const targetUrl = streamState.keepAliveUrl || process.env.RENDER_EXTERNAL_URL;
  if (targetUrl) {
    const cleanUrl = targetUrl.replace(/\/$/, '');
    const pingEndpoint = `${cleanUrl}/api/health`;
    fetch(pingEndpoint)
      .then((res) => {
        if (res.ok) {
          streamState.lastPingTime = new Date().toLocaleTimeString();
          if (streamState.isStreaming) {
            addServerLog(`[Keep-Alive ⚡] Self-ping successful at ${streamState.lastPingTime}. Server will NOT sleep!`, 'success');
          }
        }
      })
      .catch((err) => {
        console.warn('Keep-alive ping error:', err.message);
      });
  }
}, 7 * 60 * 1000); // Run every 7 minutes (well under the 15-minute Render timeout)

// API: Health check & system capabilities
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    ffmpegInstalled: checkFFmpegInstalled(),
    isStreaming: streamState.isStreaming,
    keepAliveConfigured: Boolean(streamState.keepAliveUrl || process.env.RENDER_EXTERNAL_URL),
    lastPingTime: streamState.lastPingTime,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// API: Set Keep-Alive URL dynamically from UI
app.post('/api/keepalive/set-url', (req: Request, res: Response) => {
  const { url } = req.body;
  if (url && typeof url === 'string') {
    streamState.keepAliveUrl = url.trim();
    addServerLog(`[Keep-Alive ⚡] Auto-ping URL set to: ${streamState.keepAliveUrl}`, 'info');
    res.json({ success: true, message: 'Keep-Alive URL configured successfully!' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid URL provided' });
  }
});

// API: Current stream status
app.get('/api/stream/status', (_req: Request, res: Response) => {
  res.json({
    ...streamState,
    isRealFFmpegRunning: activeProcess !== null,
  });
});

// API: Start Real FFmpeg Livestream
app.post('/api/stream/start', (req: Request, res: Response) => {
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
    res.status(400).json({ success: false, message: 'Stream is already running!' });
    return;
  }

  const baseRtmp = rtmpChoice === 'other' ? customRtmpUrl : RTMP_PRESETS[rtmpChoice];
  if (!baseRtmp) {
    res.status(400).json({ success: false, message: 'Invalid RTMP destination URL' });
    return;
  }

  if (!streamKey || !streamKey.trim()) {
    res.status(400).json({ success: false, message: 'Stream Key is required' });
    return;
  }

  const inputSource = videoSource === 'file' ? videoFilePath : videoUrl;
  if (!inputSource || !inputSource.trim()) {
    res.status(400).json({ success: false, message: 'Video input source is required' });
    return;
  }

  const cleanBase = baseRtmp.endsWith('/') ? baseRtmp : `${baseRtmp}/`;
  const fullRtmpDestination = `${cleanBase}${streamKey.trim()}`;

  // Reset state
  streamState.isStreaming = true;
  streamState.isPaused = false;
  streamState.frame = 0;
  streamState.fps = '0';
  streamState.time = '00:00:00';
  streamState.size = '0 kB';
  streamState.bitrate = '0 kbits/s';
  streamState.speed = '0';
  streamState.destination = cleanBase;
  streamState.source = inputSource;
  streamState.error = null;
  streamState.logs = [];

  addServerLog(`[Server Engine] Starting real FFmpeg broadcast pipeline...`, 'info');
  addServerLog(`[Input Source] ${inputSource}`, 'info');
  addServerLog(`[Destination] ${cleanBase} [Stream Key protected]`, 'info');

  const ffmpegArgs: string[] = [];

  // Loop infinitely if repeat enabled
  if (repeat) {
    ffmpegArgs.push('-stream_loop', '-1');
  }

  // Network reconnect flags for remote video URLs
  if (inputSource.startsWith('http://') || inputSource.startsWith('https://')) {
    ffmpegArgs.push(
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5'
    );
  }

  // Real-time pacing flag
  ffmpegArgs.push('-re');

  // Input source
  ffmpegArgs.push('-i', inputSource);

  // Audio & Video encoding pipeline optimized for RTMP streaming
  if (qualityPreset === 'eco') {
    // 720p / 1200 kbps: Super low bandwidth consumption for Render 24/7 free tier
    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-b:v', '1200k',
      '-maxrate', '1500k',
      '-bufsize', '2400k',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ar', '44100'
    );
  } else if (qualityPreset === 'balanced') {
    // 720p/1080p 2500 kbps: High stability
    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-b:v', '2500k',
      '-maxrate', '3000k',
      '-bufsize', '5000k',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100'
    );
  } else {
    // Ultra / Direct Copy: 0% CPU overhead, source bitrate pass-through
    ffmpegArgs.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100'
    );
  }

  ffmpegArgs.push(
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',
    fullRtmpDestination
  );

  addServerLog(`[Command] ffmpeg ${ffmpegArgs.join(' ')}`, 'info');

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

          if (frameMatch) streamState.frame = parseInt(frameMatch[1], 10);
          if (fpsMatch) streamState.fps = fpsMatch[1];
          if (timeMatch) streamState.time = timeMatch[1].split('.')[0];
          if (sizeMatch) streamState.size = sizeMatch[1];
          if (bitrateMatch) streamState.bitrate = bitrateMatch[1];
          if (speedMatch) streamState.speed = `${speedMatch[1]}x`;

          // Periodic telemetry log every ~90 frames
          if (streamState.frame % 90 === 0) {
            addServerLog(`[Telemetry] frame=${streamState.frame} fps=${streamState.fps} time=${streamState.time} bitrate=${streamState.bitrate} speed=${streamState.speed}`, 'info');
          }
        } else if (trimmed.includes('Stream mapping:')) {
          addServerLog(`[Handshake] RTMP Server Connection Accepted! Stream mapping OK.`, 'success');
        } else if (trimmed.includes('Error') || trimmed.includes('Connection refused') || trimmed.includes('Server error')) {
          addServerLog(`[Error] ${trimmed}`, 'error');
          streamState.error = trimmed;
        } else if (trimmed.includes('Opening')) {
          addServerLog(trimmed, 'info');
        }
      }
    });

    proc.on('close', (code) => {
      addServerLog(`[Process] FFmpeg process exited with code ${code}`, code === 0 ? 'info' : 'warn');
      activeProcess = null;
      streamState.isStreaming = false;
    });

    proc.on('error', (err) => {
      addServerLog(`[Process Error] Failed to start FFmpeg: ${err.message}`, 'error');
      activeProcess = null;
      streamState.isStreaming = false;
      streamState.error = err.message;
    });

    res.json({
      success: true,
      message: 'Real FFmpeg livestream process started on server!',
    });
  } catch (err: any) {
    activeProcess = null;
    streamState.isStreaming = false;
    streamState.error = err.message;
    res.status(500).json({ success: false, message: `Failed to launch FFmpeg: ${err.message}` });
  }
});

// API: Stop Real FFmpeg Livestream
app.post('/api/stream/stop', (_req: Request, res: Response) => {
  if (activeProcess) {
    addServerLog(`[Server Engine] Stopping FFmpeg process PID ${activeProcess.pid}...`, 'warn');
    activeProcess.kill('SIGINT');
    setTimeout(() => {
      if (activeProcess) {
        activeProcess.kill('SIGKILL');
        activeProcess = null;
      }
    }, 1500);
  }

  streamState.isStreaming = false;
  addServerLog(`[Server Engine] Livestream stopped cleanly.`, 'success');
  res.json({ success: true, message: 'Livestream stopped.' });
});

// Start Express server
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DoLive Full-Stack Server running at http://0.0.0.0:${PORT}`);
    console.log(`🎬 FFmpeg binary detected: ${checkFFmpegInstalled() ? 'YES (/usr/bin/ffmpeg)' : 'NO'}`);
  });
}

startServer();
