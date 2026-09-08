import type { Replay } from './replay';

export interface ReplayExportRequest {
  replay: Replay;
  start: number;
  end: number;
  camera: 'recorded' | 'chase' | 'front';
  portrait: boolean;
  quality: ReplayExportQuality;
}
export type ReplayExportMessage =
  | { type: 'progress'; progress: number }
  | { type: 'complete'; blob: Blob; extension: 'mp4' | 'webm'; seconds: number; elapsed: number }
  | { type: 'error'; message: string };

export const exportProfiles = {
  high: { width: 1920, height: 1080, fps: 60, bitrate: 12_000_000 },
  compact: { width: 1280, height: 720, fps: 30, bitrate: 5_000_000 },
} as const;
export type ReplayExportQuality = keyof typeof exportProfiles;
export const exportFps = exportProfiles.high.fps;

export function exportProfile(quality: ReplayExportQuality, portrait: boolean) {
  const profile = exportProfiles[quality];
  if (!profile) throw new Error('Choose a supported video quality.');
  return {
    ...profile,
    width: portrait ? profile.height : profile.width,
    height: portrait ? profile.width : profile.height,
  };
}

/** The movie clock is independent of how long rendering/encoding takes. */
export function exportFrameCount(duration: number, fps: number = exportFps) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
    throw new Error('Choose a replay between zero and ten minutes long.');
  if (fps !== 30 && fps !== 60) throw new Error('Choose a supported frame rate.');
  return Math.ceil(duration * fps);
}

export function exportFrameTiming(index: number, duration: number, fps: number = exportFps) {
  const timestamp = index / fps;
  return { timestamp, duration: Math.min(1 / fps, duration - timestamp) };
}
