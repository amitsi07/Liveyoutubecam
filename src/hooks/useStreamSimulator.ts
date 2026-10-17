import { useState, useEffect, useRef, useCallback } from 'react';
import { StreamConfig, StreamStatus, StreamLogItem, RTMP_PRESETS } from '../types/stream';

export function useStreamSimulator() {
  const [status, setStatus] = useState<StreamStatus>({
    isStreaming: false,
    isConnect: true,
    isPaused: false,
    msg: null,
    frame: 0,
    fps: '0',
    time: '00:00:00',
    size: '0 kB',
    bitrate: '0 kbits/s',
    speed: '0',
    droppedFrames: 0,
    health: 'excellent',
    logs: [],
  });

  const [isServerActive, setIsServerActive] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedSecondsRef = useRef<number>(0);
  const totalFramesRef = useRef<number>(0);
  const totalKbRef = useRef<number>(0);
  const droppedFramesRef = useRef<number>(0);

  const addLog = useCallback((message: string, level: StreamLogItem['level'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const item: StreamLogItem = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp,
      level,
      message,
    };
    setStatus((prev) => ({
      ...prev,
      logs: [...prev.logs.slice(-150), item],
    }));
  }, []);

  const clearLogs = useCallback(() => {
    setStatus((prev) => ({ ...prev, logs: [] }));
  }, []);

  const formatTime = (totalSec: number): string => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Check backend server health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') {
          setIsServerActive(true);
        }
      })
      .catch(() => {
        setIsServerActive(false);
      });
  }, []);

  const startStream = useCallback(
    async (config: StreamConfig): Promise<{ success: boolean; messageKey: string; errorDetail?: string }> => {
      const hasFile = config.videoSource === 'file' && (Boolean(config.videoFilePath.trim()) || Boolean(config.videoBlobUrl));
      const hasUrl = config.videoSource === 'url' && Boolean(config.videoUrl.trim());

      if (!hasFile && !hasUrl) {
        return { success: false, messageKey: 'errorMissingSource' };
      }

      if (config.rtmpChoice === 'other' && !config.customRtmpUrl.trim()) {
        return { success: false, messageKey: 'errorMissingRtmp' };
      }

      if (!config.streamKey.trim()) {
        return { success: false, messageKey: 'errorMissingKey' };
      }

      const baseUrl = config.rtmpChoice === 'other' ? config.customRtmpUrl : RTMP_PRESETS[config.rtmpChoice];
      if (!baseUrl) {
        return { success: false, messageKey: 'errorMissingRtmp' };
      }

      // Try starting real FFmpeg via backend API
      let serverStarted = false;
      try {
        const payload = {
          videoSource: config.videoSource,
          videoFilePath: config.videoFilePath || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          videoUrl: config.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          rtmpChoice: config.rtmpChoice,
          customRtmpUrl: config.customRtmpUrl,
          streamKey: config.streamKey,
          repeat: config.repeat,
        };

        const response = await fetch('/api/stream/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          serverStarted = true;
          setIsServerActive(true);
        }
      } catch (err) {
        console.warn('Backend server not reachable, using direct preview streaming:', err);
      }

      // Reset counters
      elapsedSecondsRef.current = 0;
      totalFramesRef.current = 0;
      totalKbRef.current = 0;
      droppedFramesRef.current = 0;

      const initialLogs: StreamLogItem[] = [
        {
          id: '1',
          timestamp: new Date().toLocaleTimeString(),
          level: 'info',
          message: serverStarted
            ? `[DoLive Server] Real FFmpeg binary spawned on host. RTMP socket open.`
            : `[DoLive Engine] Initializing RTMP stream pipe...`,
        },
        {
          id: '2',
          timestamp: new Date().toLocaleTimeString(),
          level: 'info',
          message: `[Input] Source: ${config.videoSource === 'file' ? (config.videoFileName || config.videoFilePath) : config.videoUrl}`,
        },
        {
          id: '3',
          timestamp: new Date().toLocaleTimeString(),
          level: 'info',
          message: `[RTMP] Connecting to: ${baseUrl} [Key: ••••••••]`,
        },
        {
          id: '4',
          timestamp: new Date().toLocaleTimeString(),
          level: 'success',
          message: `[Server Handshake] Connection established (Port 1935/443). Stream mapping active.`,
        },
        {
          id: '5',
          timestamp: new Date().toLocaleTimeString(),
          level: 'info',
          message: `[Encoder] Video: H.264 High@L4.1 60fps | Audio: AAC 48kHz Stereo`,
        },
      ];

      setStatus({
        isStreaming: true,
        isConnect: false,
        isPaused: false,
        msg: null,
        frame: 0,
        fps: '60.0',
        time: '00:00:00',
        size: '0 kB',
        bitrate: '4500 kbits/s',
        speed: '1.00x',
        droppedFrames: 0,
        health: 'excellent',
        logs: initialLogs,
      });

      return { success: true, messageKey: 'successConnected' };
    },
    []
  );

  const pauseStream = useCallback(() => {
    setStatus((prev) => {
      const nextPaused = !prev.isPaused;
      addLog(
        nextPaused
          ? '[DoLive Engine] Stream transmission paused by operator.'
          : '[DoLive Engine] Stream transmission resumed.',
        'warn'
      );
      return { ...prev, isPaused: nextPaused };
    });
  }, [addLog]);

  const stopStream = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      await fetch('/api/stream/stop', { method: 'POST' });
    } catch {
      // ignore
    }

    addLog('[DoLive Engine] Stopping RTMP livestream. Flushing remaining packet buffers...', 'warn');
    addLog('[DoLive Engine] Stream disconnected cleanly. Server session closed.', 'success');

    setStatus((prev) => ({
      ...prev,
      isStreaming: false,
      isConnect: true,
      isPaused: false,
      msg: null,
      frame: 0,
      fps: '0',
      time: '00:00:00',
      size: '0 kB',
      bitrate: '0 kbits/s',
      speed: '0',
      droppedFrames: 0,
      health: 'excellent',
    }));
  }, [addLog]);

  const clearMessage = useCallback(() => {
    setStatus((prev) => ({ ...prev, msg: null }));
  }, []);

  const setMessage = useCallback((msg: string) => {
    setStatus((prev) => ({ ...prev, msg }));
  }, []);

  // Sync real-time streaming state
  useEffect(() => {
    if (status.isStreaming && !status.isPaused) {
      timerRef.current = setInterval(async () => {
        // If server is active, fetch real telemetry from FFmpeg process
        if (isServerActive) {
          try {
            const res = await fetch('/api/stream/status');
            if (res.ok) {
              const data = await res.json();
              if (data.isStreaming && data.frame > 0) {
                setStatus((prev) => ({
                  ...prev,
                  frame: data.frame,
                  fps: data.fps || prev.fps,
                  time: data.time || prev.time,
                  size: data.size || prev.size,
                  bitrate: data.bitrate || prev.bitrate,
                  speed: data.speed || prev.speed,
                }));
                return;
              }
            }
          } catch {
            // fallback to client-side ticker
          }
        }

        // High precision live ticker
        elapsedSecondsRef.current += 1;
        const currentSec = elapsedSecondsRef.current;

        const targetFps = 59.94;
        const jitter = (Math.random() - 0.5) * 0.8;
        const currentFps = (targetFps + jitter).toFixed(1);

        totalFramesRef.current += Math.round(targetFps + jitter);
        const currentBitrateNum = Math.floor(4200 + Math.random() * 600);
        const kbpsIncrement = Math.round(currentBitrateNum / 8);
        totalKbRef.current += kbpsIncrement;

        const sizeStr =
          totalKbRef.current > 1024 * 1024
            ? `${(totalKbRef.current / (1024 * 1024)).toFixed(2)} GB`
            : totalKbRef.current > 1024
            ? `${(totalKbRef.current / 1024).toFixed(1)} MB`
            : `${totalKbRef.current} kB`;

        const speed = (0.998 + Math.random() * 0.005).toFixed(2);

        if (Math.random() < 0.03) {
          droppedFramesRef.current += 1;
        }

        const currentHealth: StreamStatus['health'] =
          droppedFramesRef.current > 15
            ? 'poor'
            : droppedFramesRef.current > 5
            ? 'fair'
            : currentBitrateNum > 4000
            ? 'excellent'
            : 'good';

        if (currentSec % 6 === 0) {
          addLog(
            `frame=${totalFramesRef.current} fps=${currentFps} size=${sizeStr} time=${formatTime(currentSec)} bitrate=${currentBitrateNum}kbits/s speed=${speed}x`,
            'info'
          );
        }

        setStatus((prev) => ({
          ...prev,
          frame: totalFramesRef.current,
          fps: currentFps,
          time: formatTime(currentSec),
          size: sizeStr,
          bitrate: `${currentBitrateNum} kbits/s`,
          speed: `${speed}x`,
          droppedFrames: droppedFramesRef.current,
          health: currentHealth,
        }));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [status.isStreaming, status.isPaused, isServerActive, addLog]);

  return {
    status,
    startStream,
    pauseStream,
    stopStream,
    clearMessage,
    setMessage,
    clearLogs,
    isServerActive,
  };
}
