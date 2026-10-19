import { useState, useEffect, useRef, useCallback } from 'react';
import { StreamConfig, StreamStatus, StreamLogItem, RTMP_PRESETS } from '../types/stream';
import { getAuthToken } from '../utils/keyHandler';

export function useStreamManager() {
  const [status, setStatus] = useState<StreamStatus>({
    sessionState: 'IDLE',
    isStreaming: false,
    isConnect: true,
    isPaused: false,
    isDemoMode: false,
    msg: null,
    frame: 0,
    fps: '--',
    time: '00:00:00',
    size: '0 kB',
    bitrate: '--',
    speed: '--',
    droppedFrames: 0,
    health: 'good',
    logs: [],
    destinationRedacted: undefined,
  });

  const [isServerActive, setIsServerActive] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const demoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const demoSecondsRef = useRef<number>(0);

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
    fetch('/health')
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

  // Poll server state while real streaming is active
  useEffect(() => {
    if (status.isStreaming && !status.isDemoMode && isServerActive) {
      const pollServerStatus = async () => {
        try {
          const token = getAuthToken();
          const res = await fetch('/api/stream/status', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (res.ok) {
            const data = await res.json();

            // If server FFmpeg is running, update live metrics from real process
            if (data.isRealFFmpegRunning) {
              const currentHealth =
                data.speed && parseFloat(data.speed) < 0.8
                  ? 'poor'
                  : data.bitrate && data.bitrate !== '0 kbits/s'
                  ? 'excellent'
                  : 'good';

              setStatus((prev) => ({
                ...prev,
                sessionState: data.sessionState || (data.frame > 0 ? 'LIVE' : 'STARTING'),
                frame: data.frame || 0,
                fps: data.fps || '--',
                time: data.time || prev.time,
                size: data.size || prev.size,
                bitrate: data.bitrate || '--',
                speed: data.speed || '--',
                health: currentHealth,
                destinationRedacted: data.destinationRedacted,
                logs:
                  data.logs && data.logs.length > 0
                    ? data.logs.map((l: any, idx: number) => ({
                        id: `srv-${idx}-${l.timestamp}`,
                        timestamp: l.timestamp,
                        level: l.level,
                        message: l.message,
                      }))
                    : prev.logs,
              }));
            } else if (!data.isStreaming && prevStreamingRef.current) {
              // Real server FFmpeg has terminated
              const failureMsg =
                data.error ||
                'FFmpeg process exited. Check the Terminal Console Logs below for error details.';

              setStatus((prev) => ({
                ...prev,
                isStreaming: false,
                isConnect: true,
                sessionState: data.error ? 'ERROR' : 'STOPPED',
                msg: failureMsg,
                logs:
                  data.logs && data.logs.length > 0
                    ? data.logs.map((l: any, idx: number) => ({
                        id: `srv-err-${idx}`,
                        timestamp: l.timestamp,
                        level: l.level,
                        message: l.message,
                      }))
                    : prev.logs,
              }));
            }
          }
        } catch (err) {
          console.warn('Status poll warning:', err);
        }
      };

      timerRef.current = setInterval(pollServerStatus, 1000);
      pollServerStatus(); // immediate first check
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status.isStreaming, status.isDemoMode, isServerActive]);

  const prevStreamingRef = useRef(status.isStreaming);
  useEffect(() => {
    prevStreamingRef.current = status.isStreaming;
  }, [status.isStreaming]);

  // Start Stream handler
  const startStream = useCallback(
    async (
      config: StreamConfig
    ): Promise<{ success: boolean; messageKey: string; errorDetail?: string }> => {
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

      // If user requested DEMO / PREVIEW mode, run safe simulated demo
      if (config.isDemoMode) {
        demoSecondsRef.current = 0;
        addLog('[Demo Mode] Starting local browser simulation (No external RTMP traffic)...', 'info');

        setStatus({
          sessionState: 'LIVE',
          isStreaming: true,
          isConnect: false,
          isPaused: false,
          isDemoMode: true,
          msg: null,
          frame: 1,
          fps: '30.0',
          time: '00:00:01',
          size: '120 kB',
          bitrate: '2500 kbits/s',
          speed: '1.00x',
          droppedFrames: 0,
          health: 'excellent',
          logs: [
            {
              id: 'demo-1',
              timestamp: new Date().toLocaleTimeString(),
              level: 'info',
              message: '[Demo Mode] UI Visualizer active for local preview.',
            },
          ],
        });

        if (demoTimerRef.current) clearInterval(demoTimerRef.current);
        demoTimerRef.current = setInterval(() => {
          setStatus((prev) => {
            if (prev.isPaused) return prev;
            demoSecondsRef.current += 1;
            const sec = demoSecondsRef.current;
            return {
              ...prev,
              frame: sec * 30,
              time: formatTime(sec),
              size: `${(sec * 0.3).toFixed(1)} MB`,
            };
          });
        }, 1000);

        return { success: true, messageKey: 'successConnected' };
      }

      // REAL BROADCAST MODE: Set state to STARTING (never fabricate LIVE!)
      setStatus((prev) => ({
        ...prev,
        sessionState: 'STARTING',
        isStreaming: true,
        isConnect: false,
        isPaused: false,
        isDemoMode: false,
        frame: 0,
        fps: '--',
        time: '00:00:00',
        size: '0 kB',
        bitrate: '--',
        speed: '--',
        msg: null,
        logs: [
          {
            id: 'init-1',
            timestamp: new Date().toLocaleTimeString(),
            level: 'info',
            message: `[DoLive Engine] Initializing broadcast pipeline on server...`,
          },
          {
            id: 'init-2',
            timestamp: new Date().toLocaleTimeString(),
            level: 'info',
            message: `[Target] Platform: ${config.rtmpChoice.toUpperCase()} [Stream Key protected]`,
          },
        ],
      }));

      try {
        const token = getAuthToken();
        const payload = {
          videoSource: config.videoSource,
          videoFilePath: config.videoFilePath,
          videoUrl: config.videoUrl,
          rtmpChoice: config.rtmpChoice,
          customRtmpUrl: config.customRtmpUrl,
          streamKey: config.streamKey,
          repeat: config.repeat,
          qualityPreset: config.qualityPreset || 'balanced',
        };

        const response = await fetch('/api/stream/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          const errorMsg = data.message || 'Server rejected stream request.';
          setStatus((prev) => ({
            ...prev,
            sessionState: 'ERROR',
            isStreaming: false,
            isConnect: true,
            msg: errorMsg,
          }));
          addLog(`[Server Error] ${errorMsg}`, 'error');
          return { success: false, messageKey: errorMsg, errorDetail: errorMsg };
        }

        addLog(`[Server Engine] Real FFmpeg process started with PID on server.`, 'success');
        return { success: true, messageKey: 'successConnected' };
      } catch (err: any) {
        const networkError = `Could not reach server: ${err.message}`;
        setStatus((prev) => ({
          ...prev,
          sessionState: 'ERROR',
          isStreaming: false,
          isConnect: true,
          msg: networkError,
        }));
        addLog(`[Connection Error] ${networkError}`, 'error');
        return { success: false, messageKey: networkError, errorDetail: networkError };
      }
    },
    [addLog]
  );

  const pauseStream = useCallback(() => {
    setStatus((prev) => {
      const nextPaused = !prev.isPaused;
      addLog(
        nextPaused
          ? '[DoLive Engine] Stream playback paused on display.'
          : '[DoLive Engine] Stream playback resumed.',
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
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }

    setStatus((prev) => ({ ...prev, sessionState: 'STOPPING' }));

    try {
      const token = getAuthToken();
      await fetch('/api/stream/stop', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // ignore network errors on stop
    }

    addLog('[DoLive Engine] Stream stopped. Process terminated.', 'info');

    setStatus((prev) => ({
      ...prev,
      sessionState: 'STOPPED',
      isStreaming: false,
      isConnect: true,
      isPaused: false,
      isDemoMode: false,
      msg: null,
      frame: 0,
      fps: '--',
      time: '00:00:00',
      size: '0 kB',
      bitrate: '--',
      speed: '--',
      droppedFrames: 0,
      health: 'good',
    }));
  }, [addLog]);

  const clearMessage = useCallback(() => {
    setStatus((prev) => ({ ...prev, msg: null }));
  }, []);

  const setMessage = useCallback((msg: string) => {
    setStatus((prev) => ({ ...prev, msg }));
  }, []);

  return {
    status,
    startStream,
    pauseStream,
    stopStream,
    addLog,
    clearLogs,
    clearMessage,
    setMessage,
    isServerActive,
  };
}

// Backwards compatibility alias
export const useStreamSimulator = useStreamManager;
