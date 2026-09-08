import {
  BufferTarget,
  CanvasSource,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';
import type { Settings } from '../config';
import { GameScene } from './scene';
import { replayDuration, sampleReplay } from './replay';
import {
  exportProfile,
  exportFrameCount,
  exportFrameTiming,
  type ReplayExportRequest,
  type ReplayExportMessage,
} from './replay-export';

const scope = globalThis as unknown as Pick<Worker, 'onmessage' | 'postMessage'>;
const send = (message: ReplayExportMessage) => scope.postMessage(message);

// Each worker handles one immutable replay and is terminated on completion or
// cancellation. It owns its canvas, renderer, encoder and output buffer.
scope.onmessage = async ({ data }: MessageEvent<ReplayExportRequest>) => {
  let scene: GameScene | undefined;
  let output: Output | undefined;
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof VideoEncoder === 'undefined')
      throw new Error('Fast export is unavailable here. Use Record in real time.');
    const { replay, start, end, camera, portrait } = data;
    if (start < 0 || end > replayDuration(replay)) throw new Error('Invalid replay clip.');
    const duration = end - start;
    const { width, height, fps, bitrate } = exportProfile(data.quality, portrait);
    const count = exportFrameCount(duration, fps);
    const quality = new Quality({ bitrate });
    const options = { width, height, quality, latencyMode: 'quality' as const };
    const codec = (await canEncodeVideo('avc', options))
      ? 'avc'
      : (await canEncodeVideo('vp8', options))
        ? 'vp8'
        : null;
    if (!codec)
      throw new Error(
        'This video quality is unavailable in your browser. Try 720p quality or Record in real time.',
      );
    const began = performance.now();
    const canvas = new OffscreenCanvas(width, height);
    let settings: Settings | undefined;
    let bytes = 0;
    const target = new BufferTarget();
    output = new Output({
      target,
      format: codec === 'avc' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    });
    const source = new CanvasSource(canvas, {
      codec,
      quality,
      latencyMode: 'quality',
      onEncodedPacket: (packet) => {
        bytes += packet.byteLength;
        if (bytes > 200 * 1024 * 1024)
          throw new Error('This video is too large. Choose a shorter clip or 720p quality.');
      },
    });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    let lastProgress = began;
    for (let index = 0; index < count; index++) {
      const timing = exportFrameTiming(index, duration, fps);
      const pose = sampleReplay(replay, start + timing.timestamp);
      if (!scene) scene = new GameScene(canvas, pose.settings);
      if (pose.settings !== settings) {
        scene.applySettings(pose.settings);
        settings = pose.settings;
      }
      scene.render(
        pose.state,
        index === 0 ? 0 : 1 / fps,
        true,
        pose.brake,
        index > 0,
        camera === 'recorded' ? pose.frontView : camera === 'front',
        pose.challenge,
      );
      // Capture immediately while the WebGL drawing buffer is valid. Awaiting
      // add applies encoder backpressure instead of retaining unbounded frames.
      await source.add(timing.timestamp, timing.duration, {
        keyFrame: index % (fps * 2) === 0,
      });
      if (performance.now() - lastProgress > 200 || index === count - 1) {
        send({ type: 'progress', progress: (index + 1) / count });
        lastProgress = performance.now();
      }
    }
    source.close();
    await output.finalize();
    const extension = codec === 'avc' ? 'mp4' : 'webm';
    const blob = new Blob([target.buffer!], { type: `video/${extension}` });
    send({
      type: 'complete',
      blob,
      extension,
      seconds: duration,
      elapsed: (performance.now() - began) / 1000,
    });
  } catch (error) {
    await output?.cancel().catch(() => {});
    send({
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Fast video export failed. Try a shorter clip or Record in real time.',
    });
  } finally {
    scene?.dispose();
  }
};
