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
  yt: 'rtmp://a.rtmp.youtube.com/live2/',
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
}

export interface StreamLogItem {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface StreamStatus {
  isStreaming: boolean;
  isConnect: boolean;
  isPaused: boolean;
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
}

export interface KeyStorage {
  ip: string;
  key: string;
  date: string;
  authenticated: boolean;
}

export type Language = 'en' | 'vi';
