import type { WorldSettings } from '../config/world';

/** Quiet procedural ambience. No downloads; starts only after a user gesture. */
export class Ambience {
  private context?: AudioContext;
  private gain?: GainNode;
  private source?: AudioBufferSourceNode;
  private filter?: BiquadFilterNode;
  enabled = false;
  async toggle() {
    if (!this.context) {
      this.context = new AudioContext();
      const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 4,
        this.context.sampleRate,
      );
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        previous = (previous + Math.random() * 0.04 - 0.02) / 1.02;
        data[i] = previous * 3;
      }
      this.source = this.context.createBufferSource();
      this.source.buffer = buffer;
      this.source.loop = true;
      this.filter = this.context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 650;
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.source.connect(this.filter).connect(this.gain).connect(this.context.destination);
      this.source.start();
    }
    await this.context.resume();
    this.enabled = !this.enabled;
    return this.enabled;
  }
  update(speed: number, paused: boolean, world: WorldSettings) {
    if (this.context && this.gain && this.filter) {
      const rain = world.weather === 'rain' ? world.weatherIntensity : 0;
      const surf =
        world.landscape === 'coast' ? 0.035 * (1 + Math.sin(this.context.currentTime * 0.5)) : 0;
      this.filter.frequency.setTargetAtTime(
        420 + world.wind * 600 + rain * 1100,
        this.context.currentTime,
        1,
      );
      this.gain.gain.setTargetAtTime(
        this.enabled && !paused ? 0.08 + world.wind * 0.12 + speed * 0.003 + surf + rain * 0.04 : 0,
        this.context.currentTime,
        0.4,
      );
    }
  }
  dispose() {
    this.source?.stop();
    void this.context?.close();
  }
}
