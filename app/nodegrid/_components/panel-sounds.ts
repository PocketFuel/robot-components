// Shared lightweight hover / grid tick sounds for node grid canvas + floating panels.

export class PanelSoundEffects {
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;

  async initialize() {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const response = await fetch('/hoverfx2.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn('Failed to initialize sound:', e);
    }
  }

  play(volume: number = 0.035, pitch: number = 0.8) {
    if (!this.audioContext || !this.audioBuffer) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const duration = 0.06;

      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();

      source.buffer = this.audioBuffer;
      source.playbackRate.value = pitch;
      gainNode.gain.setValueAtTime(volume, now);
      gainNode.gain.setValueAtTime(volume, now + duration - 0.01);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.start(now);
      source.stop(now + duration);
    } catch (e) {
      console.warn('Failed to play sound:', e);
    }
  }

  playRandomized(baseVolume: number = 0.035, basePitch: number = 0.8, pitchVariation: number = 0.15) {
    const pitch = basePitch + (Math.random() - 0.5) * 2 * pitchVariation;
    const volume = baseVolume * (0.9 + Math.random() * 0.2);
    this.play(volume, pitch);
  }
}

export const panelSounds = new PanelSoundEffects();
