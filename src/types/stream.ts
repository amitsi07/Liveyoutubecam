export type VideoSourceType = 'file' | 'url';

export type RTMPPlatform = 'fb' | 'yt' | 'tiktok' | 'twitch' | 'kick' | 'other';

export interface RTMPPresetInfo {
  id: RTMPPlatform;
  name: string;
  url: string;
  defaultPort: number;
  docsUrl?: string;
  icon?: string;
}

export const RTMP_PRESETS: Record<RTMPPlatform, string> = {
  fb: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  yt: 'rtmps://a.rtmp.youtube.com:443/live2/',
  tiktok: 'rtmp://push-rtmp-l1-sg01.tiktokcdn.com/game/',
  twitch: 'rtmp://live.twitch.tv/app/',
  kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/',
  other: '',
};

export interface StreamConfig {
  videoSource: VideoSourceType;
  videoFilePath: string;
  videoUrl: string;
  videoBlobUrl?: string;
  videoFileName?: string;
  rtmpChoice: RTMPPlatform;
  customRtmpUrl: string;
  streamKey: string;
  repeat: boolean;
  qualityPreset?: 'ultra' | 'balanced' | 'eco';
  videoResolution?: string;
  isDemoMode?: boolean;
}

export interface StreamLogItem {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export type SessionState = 'IDLE' | 'STARTING' | 'LIVE' | 'STOPPING' | 'ERROR' | 'STOPPED';

export interface StreamStatus {
  isStreaming: boolean;
  isConnect: boolean;
  isPaused: boolean;
  sessionState: SessionState;
  isDemoMode: boolean;
  msg: string | null;
  frame: number;
  fps: string;
  time: string;
  size: string;
  bitrate: string;
  speed: string;
  droppedFrames: number;
  health: 'excellent' | 'good' | 'fair' | 'poor';
  logs: StreamLogItem[];
  destinationRedacted?: string;
}

export interface KeyStorage {
  ip: string;
  key: string;
  date: string;
  authenticated: boolean;
  token?: string;
}

export type Language = 'en' | 'vi';
