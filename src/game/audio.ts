const TITLE_MUSIC_URL = './assets/aistudio/tiktok_video.mp4_9e7a66e8.mp3';

function resolveAudioUrl(src: string): string {
  if (typeof window !== 'undefined') {
    const inlineMap = (window as unknown as { __INLINE_ASSETS__?: Record<string, string> }).__INLINE_ASSETS__;
    if (inlineMap) {
      const altKey = src.startsWith('./') ? src.slice(1) : `./${src.replace(/^\//, '')}`;
      if (inlineMap[src]) return inlineMap[src];
      if (inlineMap[altKey]) return inlineMap[altKey];
    }
  }
  return src;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private muted = false;
  private musicPlaying = false;
  private musicTimer: number | null = null;
  private stepIdx = 0;

  // Outside-game / Title screen music (<audio> using user-provided MP3)
  private titleAudio: HTMLAudioElement | null = null;
  private titleMusicDesired = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (ua && !ua.hasBeenActive) return null;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.85;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.24;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.78;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private ensureTitleAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.titleAudio) {
      const audio = new Audio(resolveAudioUrl(TITLE_MUSIC_URL));
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = this.muted ? 0 : 0.42;
      audio.onerror = () => {
        // Ignore missing/blocked audio asset gracefully so gameplay continues uninterrupted
      };
      this.titleAudio = audio;
    }
    return this.titleAudio;
  }

  public unlock(): void {
    this.ensureContext();
    if (this.titleMusicDesired && !this.muted) {
      this.tryPlayTitleAudio();
    }
  }

  private tryPlayTitleAudio(): void {
    const audio = this.ensureTitleAudio();
    if (!audio || this.muted || !this.titleMusicDesired) return;
    const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    }
  }

  public startTitleMusic(): void {
    this.titleMusicDesired = true;
    const audio = this.ensureTitleAudio();
    if (audio) {
      audio.volume = this.muted ? 0 : 0.42;
    }
    this.tryPlayTitleAudio();
  }

  public stopTitleMusic(): void {
    this.titleMusicDesired = false;
    if (this.titleAudio && !this.titleAudio.paused) {
      this.titleAudio.pause();
      this.titleAudio.currentTime = 0;
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.03);
    }
    if (this.titleAudio) {
      this.titleAudio.volume = muted ? 0 : 0.42;
      if (muted && !this.titleAudio.paused) {
        this.titleAudio.pause();
      } else if (!muted && this.titleMusicDesired) {
        this.tryPlayTitleAudio();
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public startMusic(): void {
    this.stopTitleMusic();
    if (this.musicPlaying) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.musicPlaying = true;
    this.scheduleNextBeat();
  }

  public stopMusic(): void {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleNextBeat(): void {
    if (!this.musicPlaying) return;
    const ctx = this.ctx;
    if (ctx && this.musicGain && ctx.state === 'running' && !this.muted) {
      const now = ctx.currentTime;
      const scale = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0];
      const pattern = [0, 2, 3, 5, 3, 2, 1, 4, 0, 3, 5, 7, 6, 5, 3, 2];
      const noteFreq = scale[pattern[this.stepIdx % pattern.length]];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(noteFreq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.45);

      const echoOsc = ctx.createOscillator();
      const echoGain = ctx.createGain();
      echoOsc.type = 'sine';
      echoOsc.frequency.setValueAtTime(noteFreq * 2, now + 0.19);
      echoGain.gain.setValueAtTime(0.0001, now + 0.19);
      echoGain.gain.exponentialRampToValueAtTime(0.045, now + 0.21);
      echoGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      echoOsc.connect(echoGain);
      echoGain.connect(this.musicGain);
      echoOsc.start(now + 0.19);
      echoOsc.stop(now + 0.56);

      if (this.stepIdx % 8 === 0) {
        const bassFreq = this.stepIdx % 16 === 0 ? 73.42 : 87.31;
        const bass = ctx.createOscillator();
        const bassFilter = ctx.createBiquadFilter();
        const bassGain = ctx.createGain();
        bass.type = 'sawtooth';
        bass.frequency.setValueAtTime(bassFreq, now);
        bassFilter.type = 'lowpass';
        bassFilter.frequency.setValueAtTime(240, now);
        bassGain.gain.setValueAtTime(0.001, now);
        bassGain.gain.linearRampToValueAtTime(0.11, now + 0.35);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        bass.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.connect(this.musicGain);
        bass.start(now);
        bass.stop(now + 2.55);
      }

      this.stepIdx++;
    }
    this.musicTimer = window.setTimeout(() => this.scheduleNextBeat(), 340);
  }

  private pitchJitter(base: number, pct = 0.08): number {
    return base * (1 + (Math.random() * 2 - 1) * pct);
  }

  /**
   * Multi-layered realistic dinosaur footsteps:
   * - Earth/grass: heavy heel thump + filtered soil/grass crunch burst
   * - Bridge plank: hollow woody plank knock + timber body resonance + subtle creak
   */
  public playFootstep(onBridge: boolean, leftFoot = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const footBias = leftFoot ? 0.94 : 1.06;

    // 1. Sub-bass dino heel impact
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = onBridge ? 'triangle' : 'sine';
    thump.frequency.setValueAtTime(this.pitchJitter((onBridge ? 145 : 92) * footBias, 0.07), now);
    thump.frequency.exponentialRampToValueAtTime(onBridge ? 62 : 34, now + 0.08);
    thumpGain.gain.setValueAtTime(onBridge ? 0.24 : 0.26, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    thump.connect(thumpGain);
    thumpGain.connect(this.sfxGain);
    thump.start(now);
    thump.stop(now + 0.1);

    // 2. Surface texture layer (wood plank knock vs earthy grass crunch)
    const dur = onBridge ? 0.065 : 0.055;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const env = Math.exp(-i / (bufSize * (onBridge ? 0.22 : 0.35)));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(this.pitchJitter((onBridge ? 680 : 1150) * footBias, 0.1), now);
    filter.Q.value = onBridge ? 3.2 : 1.2;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(onBridge ? 0.28 : 0.2, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.sfxGain);
    noise.start(now);

    if (onBridge) {
      // Resonant wooden plank cavity tone
      const plank = ctx.createOscillator();
      const plankGain = ctx.createGain();
      plank.type = 'triangle';
      plank.frequency.setValueAtTime(this.pitchJitter(310 * footBias, 0.08), now);
      plank.frequency.exponentialRampToValueAtTime(195, now + 0.065);
      plankGain.gain.setValueAtTime(0.14, now);
      plankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      plank.connect(plankGain);
      plankGain.connect(this.sfxGain);
      plank.start(now);
      plank.stop(now + 0.08);
    }
  }

  public playEggCrack(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.09);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1900, now);
    filter.Q.value = 1.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  public playEggHatchPop(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    this.playEggCrack();
    const notes = [330, 440, 587.33];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.24, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playJump(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.pitchJitter(180), now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playWingFlap(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const bufSize = Math.floor(ctx.sampleRate * 0.14);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufSize) * Math.PI);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(460, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  public playLand(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.1);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playPunch(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.pitchJitter(240), now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.09);
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playKick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    osc.frequency.setValueAtTime(this.pitchJitter(290), now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.12);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playTailWhip(hitTarget = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.24);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.11);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.24);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.5, now);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.sfxGain);
    noise.start(now);

    if (hitTarget) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
      gain.gain.setValueAtTime(0.45, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + 0.04);
      osc.stop(now + 0.25);
    }
  }

  public playPteroWarning(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    [0, 0.11].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1600;
      filter.Q.value = 2.4;
      osc.frequency.setValueAtTime(idx === 0 ? 780 : 940, now + offset);
      osc.frequency.exponentialRampToValueAtTime(520, now + offset + 0.09);
      gain.gain.setValueAtTime(0.24, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.11);
    });
  }

  public playPteroSwoop(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(460, now + 0.26);
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.26);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.29);
  }

  public playPteroHit(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.14);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playPteroVictoryWings(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    [392, 523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.26, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public playRexBiteHurt(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.18);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * Comical-cute descending vocal formant "Aww..." played when Meziu Rex is defeated.
   */
  public playAwwDefeat(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;

    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(330, now);
    src.frequency.exponentialRampToValueAtTime(270, now + 0.22);
    src.frequency.exponentialRampToValueAtTime(145, now + 0.68);

    // Parallel vocal formant filters shaping an "Aww" vowel
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(700, now);
    f1.frequency.exponentialRampToValueAtTime(490, now + 0.65);
    f1.Q.value = 4.2;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1120, now);
    f2.frequency.exponentialRampToValueAtTime(810, now + 0.65);
    f2.Q.value = 5.0;

    const mix = ctx.createGain();
    mix.gain.setValueAtTime(0.001, now);
    mix.gain.linearRampToValueAtTime(0.55, now + 0.06);
    mix.gain.setValueAtTime(0.5, now + 0.28);
    mix.gain.exponentialRampToValueAtTime(0.001, now + 0.74);

    src.connect(f1);
    src.connect(f2);
    f1.connect(mix);
    f2.connect(mix);
    mix.connect(this.sfxGain);

    src.start(now);
    src.stop(now + 0.76);
  }

  public playItemDrop(kind: 'key' | 'bulb'): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === 'key' ? 'triangle' : 'sine';
    const base = kind === 'key' ? 980 : 1320;
    osc.frequency.setValueAtTime(this.pitchJitter(base, 0.06), now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.18, now + 0.08);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    [587.33, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.07;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.24, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  public playLockedRattle(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    [0, 0.08].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, now + delay);
      osc.frequency.exponentialRampToValueAtTime(90, now + delay + 0.05);
      gain.gain.setValueAtTime(0.14, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + delay);
      osc.stop(now + delay + 0.07);
    });
  }

  public playGateUnlockVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const rumble = ctx.createOscillator();
    const rGain = ctx.createGain();
    rumble.type = 'sawtooth';
    const rFilter = ctx.createBiquadFilter();
    rFilter.type = 'lowpass';
    rFilter.frequency.value = 180;
    rumble.frequency.setValueAtTime(75, now);
    rumble.frequency.linearRampToValueAtTime(55, now + 0.7);
    rGain.gain.setValueAtTime(0.28, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    rumble.connect(rFilter);
    rFilter.connect(rGain);
    rGain.connect(this.sfxGain);
    rumble.start(now);
    rumble.stop(now + 0.8);

    const chord = [293.66, 369.99, 440, 587.33, 739.99];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + 0.22 + i * 0.09;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.78);
    });
  }

  public playFallAbyss(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.65);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.72);
  }
}
