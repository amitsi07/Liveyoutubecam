import React, { useState, useRef, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  LogOut,
  Radio,
  Upload,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Terminal,
  Download,
  Trash2,
  HelpCircle,
  Sparkles,
  CheckCircle,
  Cloud,
  ShieldCheck,
} from 'lucide-react';
import {
  StreamConfig,
  StreamStatus,
  VideoSourceType,
  RTMPPlatform,
  Language,
} from '../types/stream';
import { getTranslation } from '../utils/i18n';
import { getAuthToken } from '../utils/keyHandler';

interface DashboardViewProps {
  lang: Language;
  status: StreamStatus;
  isServerActive?: boolean;
  onStartStream: (config: StreamConfig) => Promise<{ success: boolean; messageKey: string }> | { success: boolean; messageKey: string };
  onPauseStream: () => void;
  onStopStream: () => void;
  onLogout: () => void;
  onShowMessage: (msg: string) => void;
  onClearLogs: () => void;
}

const SAMPLE_VIDEOS = [
  {
    name: 'sampleBunny',
    url: 'https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4',
    title: '🐰 Big Buck Bunny (10 min)',
  },
  {
    name: 'sampleFlower',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    title: '🌸 Nature Garden (HD)',
  },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  lang,
  status,
  isServerActive,
  onStartStream,
  onPauseStream,
  onStopStream,
  onLogout,
  onShowMessage,
  onClearLogs,
}) => {
  const t = getTranslation(lang);

  const [videoSource, setVideoSource] = useState<VideoSourceType>('file');
  const [videoFilePath, setVideoFilePath] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoBlobUrl, setVideoBlobUrl] = useState<string>('');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [rtmpChoice, setRtmpChoice] = useState<RTMPPlatform>('yt');
  const [customRtmpUrl, setCustomRtmpUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [repeat, setRepeat] = useState(true);
  const [qualityPreset, setQualityPreset] = useState<'fhd' | 'balanced' | 'hd' | 'eco' | 'ultra'>('ultra');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [renderUrlInput, setRenderUrlInput] = useState(() => localStorage.getItem('dolive_render_url') || '');
  const [keepAliveStatus, setKeepAliveStatus] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  const handleActivateKeepAlive = async () => {
    if (!renderUrlInput.trim()) {
      onShowMessage(lang === 'en' ? 'Please enter your Render application URL!' : 'Vui lòng nhập URL của bạn trên Render!');
      return;
    }
    try {
      const token = getAuthToken();
      const res = await fetch('/api/keepalive/set-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: renderUrlInput.trim() }),
      });
      if (res.ok) {
        localStorage.setItem('dolive_render_url', renderUrlInput.trim());
        setKeepAliveStatus(lang === 'en' ? 'Active ⚡ Auto-pinging every 7 mins' : 'Đang hoạt động ⚡ Tự động ping mỗi 7 phút');
        onShowMessage(lang === 'en' ? 'Render Keep-Alive active! Server will not sleep.' : 'Đã kích hoạt Keep-Alive! Máy chủ sẽ không bị sleep.');
      }
    } catch {
      onShowMessage(lang === 'en' ? 'Could not reach backend server.' : 'Không thể kết nối đến máy chủ backend.');
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [status.logs, showLogs]);

  // Audio spectrum visualizer animation during streaming
  useEffect(() => {
    if (!status.isStreaming || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const barsCount = 28;

    const renderSpectrum = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / barsCount - 2;

      for (let i = 0; i < barsCount; i++) {
        // Generate dynamic animated heights
        const heightMultiplier = status.isPaused ? 0.05 : Math.random();
        const barHeight = Math.max(4, heightMultiplier * (canvas.height - 8));
        const x = i * (barWidth + 2);
        const y = canvas.height - barHeight;

        // Gradient from pink to cyan
        const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
        gradient.addColorStop(0, '#ff3399');
        gradient.addColorStop(1, '#00f2fe');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      animationFrameId = requestAnimationFrame(renderSpectrum);
    };

    renderSpectrum();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [status.isStreaming, status.isPaused]);

  // Sync HTML5 video element with pause/resume state and mute state
  useEffect(() => {
    if (!videoPlayerRef.current) return;
    videoPlayerRef.current.muted = isMuted;
    if (status.isPaused) {
      videoPlayerRef.current.pause();
    } else if (status.isStreaming) {
      videoPlayerRef.current.play().catch(() => {});
    }
  }, [status.isPaused, status.isStreaming, isMuted]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Handle local video file upload with real transfer to server and progress tracking
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      setVideoBlobUrl(blobUrl);
      setVideoFileName(file.name);
      setVideoFilePath(''); // Keep empty until confirmed by server!
      setIsUploading(true);
      setUploadStatus('uploading');
      setUploadPercent(0);
      setUploadProgress(
        lang === 'en'
          ? `Starting upload: 0% (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`
          : `Bắt đầu tải lên: 0% (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`
      );

      const token = getAuthToken();
      const uploadUrl = `/api/upload?filename=${encodeURIComponent(file.name)}`;
      const xhr = new XMLHttpRequest();

      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          setUploadPercent(pct);
          const loadedMb = (evt.loaded / (1024 * 1024)).toFixed(1);
          const totalMb = (evt.total / (1024 * 1024)).toFixed(1);
          setUploadProgress(
            lang === 'en'
              ? `Uploading: ${pct}% (${loadedMb} / ${totalMb} MB)`
              : `Đang tải: ${pct}% (${loadedMb} / ${totalMb} MB)`
          );
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.filePath) {
              setVideoFilePath(data.filePath);
              setUploadStatus('success');
              setUploadPercent(100);
              setUploadProgress(
                lang === 'en'
                  ? `Uploaded 100% (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
                  : `Đã tải lên máy chủ 100% (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
              );
              onShowMessage(
                lang === 'en'
                  ? `Video uploaded to server! (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
                  : `Đã tải video lên máy chủ! (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
              );
              return;
            }
          } catch {
            // parse error
          }
        }

        setUploadStatus('error');
        setUploadProgress(null);
        onShowMessage(
          lang === 'en'
            ? 'Upload failed. File might be too large or connection timed out.'
            : 'Tải lên thất bại. Dung lượng tệp có thể quá lớn hoặc mất kết nối.'
        );
      };

      xhr.onerror = () => {
        setIsUploading(false);
        setUploadStatus('error');
        setUploadProgress(null);
        onShowMessage(
          lang === 'en'
            ? 'Network error while uploading video to server.'
            : 'Lỗi mạng khi tải video lên máy chủ.'
        );
      };

      xhr.send(file);
    }
  };

  const handleSelectSample = (sample: typeof SAMPLE_VIDEOS[0]) => {
    setVideoSource('url');
    setVideoUrl(sample.url);
    onShowMessage(
      lang === 'en'
        ? `Loaded sample video: ${sample.title}. Ready to stream!`
        : `Đã nạp video mẫu: ${sample.title}. Sẵn sàng phát!`
    );
  };

  const handleUseDemoKey = () => {
    const randomKey = `demo_live_${Math.random().toString(36).substring(2, 8)}_preview`;
    setStreamKey(randomKey);
    setIsDemoMode(true);
    onShowMessage(
      lang === 'en'
        ? 'Generated Demo Key! 🧪 Demo / Preview Mode is active. Click "Start Livestream" to test with live audio/visualizer without needing a real YouTube key.'
        : 'Đã tạo Stream Key thử nghiệm! 🧪 Chế độ Demo / Xem trước đang bật. Nhấn "Bắt đầu phát trực tiếp" để thử nghiệm không cần key thật.'
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (videoSource === 'file' && isUploading) {
      onShowMessage(
        lang === 'en'
          ? `Video is still uploading (${uploadPercent}%). Please wait for upload to finish!`
          : `Video đang được tải lên (${uploadPercent}%). Vui lòng đợi tải xong 100%! `
      );
      return;
    }

    if (videoSource === 'file' && !videoFilePath) {
      onShowMessage(
        lang === 'en'
          ? 'Please wait for your video to finish uploading (100%) before starting! Or use a Sample Video below.'
          : 'Vui lòng đợi video tải xong 100% lên máy chủ trước! Hoặc chọn Video mẫu bên dưới.'
      );
      return;
    }

    if (videoSource === 'url') {
      const trimmedUrl = videoUrl.trim().toLowerCase();
      const isWebPage =
        (trimmedUrl.includes('youtube.com/watch') ||
          trimmedUrl.includes('youtu.be/') ||
          trimmedUrl.includes('facebook.com/') ||
          trimmedUrl.includes('fb.watch/')) &&
        !trimmedUrl.includes('.mp4') &&
        !trimmedUrl.includes('.m3u8') &&
        !trimmedUrl.includes('.flv');

      if (isWebPage) {
        onShowMessage(
          lang === 'en'
            ? 'Webpage URLs (like youtube.com/watch or facebook.com) cannot be decoded directly by FFmpeg. Please provide a direct media link (.mp4, .m3u8, .flv), upload a video file, or test with a Sample Video below.'
            : 'Link trang web (như youtube.com/watch hoặc facebook.com) không thể giải mã trực tiếp. Vui lòng dùng link video trực tiếp (.mp4, .m3u8), tải tệp lên hoặc chọn Video mẫu bên dưới.'
        );
        return;
      }
    }

    const isDemo =
      isDemoMode ||
      streamKey.startsWith('demo_') ||
      streamKey.startsWith('live_') ||
      streamKey.includes('_stream') ||
      streamKey.includes('_preview');

    const config: StreamConfig = {
      videoSource,
      videoFilePath,
      videoUrl,
      videoBlobUrl,
      videoFileName,
      rtmpChoice,
      customRtmpUrl,
      streamKey,
      repeat,
      qualityPreset,
      isDemoMode: isDemo,
    };

    const res = await onStartStream(config);
    const msg = t[res.messageKey as keyof typeof t] || res.messageKey;
    onShowMessage(msg);
  };

  const handleDownloadLogs = () => {
    const content = status.logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dolive_stream_logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getPlatformLabel = () => {
    switch (rtmpChoice) {
      case 'fb':
        return t.rtmpFacebook;
      case 'yt':
        return t.rtmpYouTube;
      case 'tiktok':
        return t.rtmpTikTok;
      case 'twitch':
        return t.rtmpTwitch;
      case 'kick':
        return t.rtmpKick;
      case 'other':
        return customRtmpUrl || t.rtmpCustom;
    }
  };

  // Video source for preview player
  const currentVideoPreviewSrc =
    videoSource === 'file'
      ? videoBlobUrl ||
        (videoFilePath.startsWith('http') || videoFilePath.startsWith('/')
          ? videoFilePath
          : SAMPLE_VIDEOS[0].url)
      : videoUrl || SAMPLE_VIDEOS[0].url;

  return (
    <div className="container">
      {/* Top Bar Navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '13px',
              color: status.isStreaming ? '#fff' : '#666',
              background: status.isStreaming
                ? 'linear-gradient(135deg, #ff3399, #e11d48)'
                : '#ffe6f0',
              padding: '4px 10px',
              borderRadius: '8px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: status.isStreaming ? '#10b981' : '#9ca3af',
              }}
            />
            {t.statusLabel} {status.isStreaming ? t.streamingStatus : t.readyStatus}
          </span>
          <span
            style={{
              fontSize: '12px',
              color: isServerActive ? '#059669' : '#6b7280',
              background: isServerActive ? '#ecfdf5' : '#f3f4f6',
              border: `1px solid ${isServerActive ? '#a7f3d0' : '#e5e7eb'}`,
              padding: '4px 8px',
              borderRadius: '8px',
              fontWeight: '600',
            }}
          >
            {isServerActive ? '⚡ FFmpeg Engine: Ready' : '🌐 Browser Mode'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setShowRenderModal(true)}
            style={{
              background: '#ecfdf5',
              border: '1px solid #10b981',
              color: '#059669',
              borderRadius: '6px',
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            <Cloud size={14} /> Render 24/7 Setup
          </button>

          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ff3399',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              fontWeight: '600',
            }}
          >
            <HelpCircle size={15} /> {t.whereToFindKey}
          </button>

          <button
            type="button"
            onClick={onLogout}
            title={t.logout}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
            }}
          >
            <LogOut size={15} /> {t.logout}
          </button>
        </div>
      </div>

      <h1>{t.appTitle}</h1>

      {/* ACTIVE LIVESTREAM MONITOR */}
      {status.isStreaming && (
        <div className="livestream-info" id="livestreamBox">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h2>
              <Radio size={22} className="animate-pulse" style={{ color: '#ff3399' }} />
              {t.nowLiveTitle}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  backgroundColor: '#ff3399',
                  color: '#fff',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  letterSpacing: '1px',
                }}
              >
                {t.liveBadge}
              </span>
            </div>
          </div>

          {/* Live Video Output & Spectrum Monitor */}
          <div
            style={{
              position: 'relative',
              borderRadius: '10px',
              overflow: 'hidden',
              backgroundColor: '#000',
              marginBottom: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <video
              ref={videoPlayerRef}
              src={currentVideoPreviewSrc}
              autoPlay
              loop={repeat}
              muted={isMuted}
              playsInline
              style={{
                width: '100%',
                maxHeight: '260px',
                objectFit: 'contain',
                display: 'block',
              }}
            />

            {/* Overlaid Audio Spectrum & Volume Controls */}
            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '12px',
                right: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                pointerEvents: 'none',
              }}
            >
              <canvas
                ref={canvasRef}
                width={160}
                height={35}
                style={{
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderRadius: '6px',
                  padding: '4px',
                }}
              />

              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                style={{
                  pointerEvents: 'auto',
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#fff',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#444',
              marginBottom: '12px',
              border: '1px solid rgba(255, 102, 178, 0.2)',
            }}
          >
            <div>
              <strong>{t.platformLabel}</strong> {getPlatformLabel()}
            </div>
            <div style={{ marginTop: '4px' }}>
              <strong>{t.streamSourceLabel}</strong>{' '}
              {videoSource === 'file'
                ? videoFileName || videoFilePath || 'Local Stream'
                : videoUrl}
            </div>
            <div style={{ marginTop: '4px' }}>
              <strong>{t.modeLabel}</strong> {repeat ? t.loopInfinite : t.playOnce}
            </div>
          </div>

          {/* Telemetry Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #ffd6e8' }}>
              <span style={{ fontSize: '12px', color: '#666', display: 'block' }}>{t.metricFrame}</span>
              <span className="metric-value" style={{ fontSize: '18px' }}>{status.frame}</span>
            </div>
            <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #ffd6e8' }}>
              <span style={{ fontSize: '12px', color: '#666', display: 'block' }}>{t.metricFps}</span>
              <span className="metric-value" style={{ fontSize: '18px' }}>{status.fps}</span>
            </div>
            <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #ffd6e8' }}>
              <span style={{ fontSize: '12px', color: '#666', display: 'block' }}>{t.metricTime}</span>
              <span className="metric-value" style={{ fontSize: '18px' }}>{status.time}</span>
            </div>
            <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #ffd6e8' }}>
              <span style={{ fontSize: '12px', color: '#666', display: 'block' }}>{t.metricBitrate}</span>
              <span className="metric-value" style={{ fontSize: '18px' }}>{status.bitrate}</span>
            </div>
            <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #ffd6e8' }}>
              <span style={{ fontSize: '12px', color: '#666', display: 'block' }}>{t.metricSize}</span>
              <span className="metric-value" style={{ fontSize: '18px' }}>{status.size}</span>
            </div>
            <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #ffd6e8' }}>
              <span style={{ fontSize: '12px', color: '#666', display: 'block' }}>{t.metricHealth}</span>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669' }}>
                {status.health === 'excellent' ? t.healthExcellent : t.healthGood}
              </span>
            </div>
          </div>

          {/* Action Control Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onPauseStream}
              style={{
                flex: 1,
                padding: '12px',
                fontSize: '15px',
                fontWeight: 'bold',
                backgroundColor: status.isPaused ? '#10b981' : '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {status.isPaused ? <Play size={16} /> : <Pause size={16} />}
              {status.isPaused ? t.resumeStreamBtn : t.pauseStreamBtn}
            </button>

            <button
              type="button"
              className="stop-btn"
              onClick={onStopStream}
              style={{ flex: 1, margin: 0 }}
            >
              {t.stopStreamBtn}
            </button>
          </div>

          {/* Terminal Console Logs Toggle */}
          <div style={{ marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              style={{
                background: 'none',
                border: '1px solid #ff66b2',
                color: '#ff3399',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Terminal size={14} />
              {t.toggleLogsBtn} ({status.logs.length})
            </button>

            {showLogs && (
              <div
                style={{
                  marginTop: '10px',
                  backgroundColor: '#111827',
                  color: '#10b981',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid #374151',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    borderBottom: '1px solid #374151',
                    paddingBottom: '4px',
                  }}
                >
                  <span style={{ color: '#9ca3af' }}>FFmpeg / RTMP Streaming Output</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleDownloadLogs}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#60a5fa',
                        cursor: 'pointer',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <Download size={12} /> {t.downloadLogsBtn}
                    </button>
                    <button
                      type="button"
                      onClick={onClearLogs}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <Trash2 size={12} /> {t.clearLogsBtn}
                    </button>
                  </div>
                </div>

                {status.logs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '2px 0',
                      color:
                        log.level === 'error'
                          ? '#f87171'
                          : log.level === 'warn'
                          ? '#fbbf24'
                          : log.level === 'success'
                          ? '#34d399'
                          : '#93c5fd',
                    }}
                  >
                    <span style={{ color: '#6b7280' }}>[{log.timestamp}]</span> {log.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* STREAM CONFIGURATION FORM (visible when not streaming) */}
      <div id="connectFormBox" style={{ display: status.isStreaming ? 'none' : 'block' }}>
        <form onSubmit={handleSubmit}>
          {/* Video Source Selection */}
          <div className="section">
            <label htmlFor="video_source">{t.videoSourceLabel}</label>
            <select
              name="video_source"
              id="video_source"
              value={videoSource}
              onChange={(e) => setVideoSource(e.target.value as VideoSourceType)}
            >
              <option value="file">{t.sourceLocalFile}</option>
              <option value="url">{t.sourceUrl}</option>
            </select>

            {/* Local File Source Details */}
            {videoSource === 'file' && (
              <div id="fileOption" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    name="video_file_path"
                    placeholder={t.filePathPlaceholder}
                    value={videoFilePath}
                    onChange={(e) => setVideoFilePath(e.target.value)}
                    required
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      backgroundColor: '#4f46e5',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Upload size={16} /> {t.chooseFileBtn}
                  </button>
                </div>
                {isUploading && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#2563eb', fontWeight: '600', marginBottom: '4px' }}>
                      <span>⏳ {uploadProgress}</span>
                      <span>{uploadPercent}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${uploadPercent}%`, height: '100%', backgroundColor: '#2563eb', transition: 'width 0.2s ease' }}></div>
                    </div>
                  </div>
                )}
                {!isUploading && uploadStatus === 'success' && videoFilePath && (
                  <span style={{ fontSize: '12px', color: '#059669', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                    <CheckCircle size={14} /> Ready to stream on server: {videoFileName}
                  </span>
                )}
                {!isUploading && uploadStatus === 'error' && (
                  <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                    ⚠️ Upload failed. Try a smaller video (&lt; 100MB) or use a Sample Video below.
                  </span>
                )}
              </div>
            )}

            {/* Video URL Source Details */}
            {videoSource === 'url' && (
              <div id="urlOption">
                <input
                  type="text"
                  name="video_url"
                  placeholder={t.urlPlaceholder}
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  required
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                  ℹ️ <strong>Direct Video URL needed</strong> (.mp4, .m3u8, .flv). Social media web links (like facebook.com/share/...) cannot be decoded directly by FFmpeg. Or choose a <strong>Sample Video</strong> below.
                </div>
              </div>
            )}

            {/* Quick Sample Video Picker */}
            <div style={{ marginTop: '6px' }}>
              <span style={{ fontSize: '13px', color: '#666', marginRight: '8px' }}>
                {t.orUseSampleVideo}
              </span>
              <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                {SAMPLE_VIDEOS.map((sample) => (
                  <button
                    key={sample.name}
                    type="button"
                    onClick={() => handleSelectSample(sample)}
                    style={{
                      background: '#fff',
                      border: '1px solid #ff66b2',
                      color: '#ff3399',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    {sample.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RTMP Destination Selection */}
          <div className="section">
            <label htmlFor="rtmp_choice">{t.rtmpDestinationLabel}</label>
            <select
              name="rtmp_choice"
              id="rtmp_choice"
              value={rtmpChoice}
              onChange={(e) => setRtmpChoice(e.target.value as RTMPPlatform)}
            >
              <option value="yt">{t.rtmpYouTube}</option>
              <option value="fb">{t.rtmpFacebook}</option>
              <option value="tiktok">{t.rtmpTikTok}</option>
              <option value="twitch">{t.rtmpTwitch}</option>
              <option value="kick">{t.rtmpKick}</option>
              <option value="other">{t.rtmpCustom}</option>
            </select>

            {rtmpChoice === 'other' && (
              <div id="custom_rtmp">
                <input
                  type="text"
                  name="custom_rtmp_url"
                  placeholder={t.customRtmpPlaceholder}
                  value={customRtmpUrl}
                  onChange={(e) => setCustomRtmpUrl(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          {/* Stream Key with Password Toggle & Demo Key Generator */}
          <div className="section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="stream_key" style={{ margin: 0 }}>{t.streamKeyLabel}</label>
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = !isDemoMode;
                    setIsDemoMode(nextMode);
                    if (nextMode && !streamKey) {
                      setStreamKey(`demo_live_${Math.random().toString(36).substring(2, 8)}_preview`);
                    }
                  }}
                  style={{
                    background: isDemoMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 51, 153, 0.1)',
                    color: isDemoMode ? '#059669' : '#ff3399',
                    border: `1px solid ${isDemoMode ? '#10b981' : '#ff99cc'}`,
                    borderRadius: '12px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                  title="Click to toggle between real broadcast and safe demo testing"
                >
                  {isDemoMode ? '🧪 Demo / Preview Mode' : '🔴 Real Broadcast Mode'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleUseDemoKey}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#059669',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Sparkles size={13} /> Demo Stream Key
              </button>
            </div>
            <div className="input-container">
              <input
                type={showStreamKey ? 'text' : 'password'}
                id="stream_key"
                name="stream_key"
                placeholder={isDemoMode ? 'demo_live_preview_key' : t.streamKeyPlaceholder}
                value={streamKey}
                onChange={(e) => {
                  const val = e.target.value;
                  setStreamKey(val);
                  if (val && !val.startsWith('demo_') && !val.includes('_stream') && !val.includes('_preview')) {
                    setIsDemoMode(false);
                  }
                }}
                required
              />
              <button
                type="button"
                className="eye-button"
                onClick={() => setShowStreamKey(!showStreamKey)}
                title={showStreamKey ? t.hideKey : t.showKey}
              >
                {showStreamKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {isDemoMode ? (
              <div style={{ fontSize: '12px', color: '#059669', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={13} />
                <span>
                  {lang === 'en'
                    ? '🧪 Demo Mode: Local preview with live audio/visualizer. To broadcast to YouTube, paste your real key from YouTube Studio.'
                    : '🧪 Chế độ Demo: Xem trước cục bộ với audio/visualizer. Để phát lên YouTube, hãy dán key thật từ YouTube Studio.'}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: '#777', marginTop: '4px' }}>
                ℹ️ {lang === 'en' ? 'Requires a valid stream key from your streaming platform.' : 'Yêu cầu Stream Key hợp lệ từ nền tảng phát sóng của bạn.'}
              </div>
            )}
          </div>

          {/* Stream Quality Preset & Bandwidth Optimizer */}
          <div className="section">
            <label htmlFor="quality_preset">
              ⚙️ {lang === 'en' ? 'Stream Quality & Bandwidth Optimizer:' : 'Tối ưu chất lượng & Băng thông:'}
            </label>
            <select
              name="quality_preset"
              id="quality_preset"
              value={qualityPreset}
              onChange={(e) => setQualityPreset(e.target.value as 'fhd' | 'balanced' | 'hd' | 'eco' | 'ultra')}
            >
              <option value="ultra">
                {lang === 'en'
                  ? '⚡ Fast Direct Stream (0% CPU / Zero Buffering on Free Tier - Recommended)'
                  : '⚡ Phát trực tiếp siêu nhanh (0% CPU / Chống giật trên Free Tier - Khuyên dùng)'}
              </option>
              <option value="eco">
                {lang === 'en'
                  ? '🍃 480p Eco Saver (Lightweight Re-encode - For Low-CPU Server)'
                  : '🍃 480p Tiết kiệm Eco (Mã hóa nhẹ - Dành cho CPU yếu)'}
              </option>
              <option value="hd">
                {lang === 'en'
                  ? '🌟 720p HD (3,000 Kbps - YouTube 720p Standard)'
                  : '🌟 720p HD (3,000 Kbps - Chuẩn YouTube 720p)'}
              </option>
              <option value="balanced">
                {lang === 'en'
                  ? '⚖️ 1080p Standard (4,500 Kbps - YouTube 1080p Standard)'
                  : '⚖️ 1080p Tiêu chuẩn (4,500 Kbps - Chuẩn YouTube 1080p)'}
              </option>
              <option value="fhd">
                {lang === 'en'
                  ? '🏆 1080p Full HD (6,000 Kbps - High CPU Servers)'
                  : '🏆 1080p Full HD (6,000 Kbps - Cần CPU mạnh)'}
              </option>
            </select>
          </div>

          {/* Repeat Stream Toggle Switch */}
          <div className="section" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <label className="switch">
              <input
                type="checkbox"
                id="repeat_checkbox"
                name="repeat"
                checked={repeat}
                onChange={(e) => setRepeat(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
            <span style={{ marginLeft: '12px', fontWeight: 'bold', color: '#333' }}>
              {t.repeatStreamLabel}
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            name="action"
            value="start"
            className="primary-btn"
            disabled={isUploading}
            style={{
              opacity: isUploading ? 0.6 : 1,
              cursor: isUploading ? 'not-allowed' : 'pointer',
            }}
          >
            {isUploading
              ? `⏳ Uploading Video (${uploadPercent}%)... Please wait`
              : t.startStreamBtn}
          </button>
        </form>
      </div>

      {/* Terminal Console Logs Section (Persistent after stop or crash) */}
      {!status.isStreaming && status.logs.length > 0 && (
        <div style={{ marginTop: '16px', background: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #ffd6e8', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showLogs ? '10px' : '0', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              style={{
                background: 'none',
                border: '1px solid #ff66b2',
                color: '#ff3399',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Terminal size={14} />
              Recent Terminal Logs ({status.logs.length})
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleDownloadLogs}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  fontWeight: '600',
                }}
              >
                <Download size={13} /> {t.downloadLogsBtn}
              </button>
              <button
                type="button"
                onClick={onClearLogs}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  fontWeight: '600',
                }}
              >
                <Trash2 size={13} /> {t.clearLogsBtn}
              </button>
            </div>
          </div>

          {showLogs && (
            <div
              style={{
                backgroundColor: '#111827',
                color: '#10b981',
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '12px',
                borderRadius: '8px',
                maxHeight: '220px',
                overflowY: 'auto',
                border: '1px solid #374151',
              }}
            >
              {status.logs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: '2px 0',
                    color:
                      log.level === 'error'
                        ? '#f87171'
                        : log.level === 'warn'
                        ? '#fbbf24'
                        : log.level === 'success'
                        ? '#34d399'
                        : '#93c5fd',
                  }}
                >
                  <span style={{ color: '#6b7280' }}>[{log.timestamp}]</span> {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Stream Key Help Modal */}
      {showHelpModal && (
        <div className="popup-overlay" onClick={() => setShowHelpModal(false)}>
          <div
            className="popup-content"
            style={{ maxWidth: '440px', textAlign: 'left' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <HelpCircle size={20} style={{ color: '#ff3399' }} />
              <strong style={{ fontSize: '18px', color: '#333', margin: 0 }}>
                {t.whereToFindKey}
              </strong>
            </div>

            <div style={{ fontSize: '13px', color: '#444', lineHeight: 1.6 }}>
              <p style={{ margin: '6px 0' }}>
                <strong>YouTube:</strong> YouTube Studio &rarr; Go Live &rarr; Stream Key (paste into DoLive).
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>Facebook:</strong> Facebook Live Producer &rarr; Stream Setup &rarr; Copy Stream Key.
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>Twitch:</strong> Creator Dashboard &rarr; Settings &rarr; Stream &rarr; Primary Stream Key.
              </p>
              <p style={{ margin: '6px 0' }}>
                <strong>TikTok:</strong> TikTok Live Studio &rarr; Settings &rarr; Server URL & Stream Key.
              </p>
            </div>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button type="button" onClick={() => setShowHelpModal(false)}>
                {t.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Render 24/7 Deployment & Anti-Sleep Modal */}
      {showRenderModal && (
        <div className="popup-overlay" onClick={() => setShowRenderModal(false)}>
          <div
            className="popup-content"
            style={{ maxWidth: '480px', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Cloud size={22} style={{ color: '#10b981' }} />
              <strong style={{ fontSize: '18px', color: '#111', margin: 0 }}>
                Render 24/7 Live Deployment
              </strong>
            </div>

            <p style={{ fontSize: '13px', color: '#555', margin: '4px 0 12px 0' }}>
              Follow these simple steps to host your DoLive instance on Render for non-stop 24/7 broadcasting without keeping your PC or phone on:
            </p>

            <div style={{ fontSize: '13px', color: '#333', lineHeight: 1.6, background: '#f9fafb', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div><strong>1. Push to GitHub:</strong> Push this repository to your GitHub account.</div>
              <div style={{ marginTop: '4px' }}><strong>2. Create on Render:</strong> Go to <a href="https://dashboard.render.com" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>Render.com</a> &rarr; <em>New +</em> &rarr; <em>Web Service</em> &rarr; Connect repo.</div>
              <div style={{ marginTop: '4px' }}><strong>3. Docker Engine:</strong> Render automatically detects the pre-configured <code>Dockerfile</code> (Node 22 + FFmpeg).</div>
              <div style={{ marginTop: '4px' }}><strong>4. Environment:</strong> Port <code>3000</code> is pre-configured.</div>
            </div>

            {/* In-App Anti-Sleep (Keep-Alive) Section */}
            <div style={{ marginTop: '16px', background: '#ecfdf5', padding: '12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065f46', fontWeight: 'bold', fontSize: '14px' }}>
                <ShieldCheck size={16} /> In-App 24/7 Keep-Alive (Prevents Sleep)
              </div>
              <p style={{ fontSize: '12px', color: '#047857', margin: '6px 0 10px 0' }}>
                Enter your live Render service URL below. The server will automatically self-ping every 7 minutes so Render never sleeps while streaming:
              </p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="https://your-dolive.onrender.com"
                  value={renderUrlInput}
                  onChange={(e) => setRenderUrlInput(e.target.value)}
                  style={{ fontSize: '13px', padding: '8px 10px' }}
                />
                <button
                  type="button"
                  onClick={handleActivateKeepAlive}
                  style={{
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Activate
                </button>
              </div>
              {keepAliveStatus && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#059669', fontWeight: 'bold' }}>
                  ✓ {keepAliveStatus}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '18px' }}>
              <button type="button" onClick={() => setShowRenderModal(false)}>
                {t.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
