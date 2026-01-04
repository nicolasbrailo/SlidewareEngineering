export class Underwater {
  constructor(audio_ctx) {
    this.audio_ctx = audio_ctx;

    this.lp = this.audio_ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.setValueAtTime(200, this.audio_ctx.currentTime);
    this.lp.gain.setValueAtTime(0.6, this.audio_ctx.currentTime);

    this.out_bus = this.audio_ctx.createGain();
    // Make up attenuation for the compressor
    this.out_bus.gain.setValueAtTime(.75, this.audio_ctx.currentTime);
  }

  disconnect() {
    this.lp.disconnect();
    this.out_bus.disconnect();
  }

  connectInput(src) {
    this.disconnect();

    src.connect(this.lp);
    this.lp.connect(this.out_bus);
  }

  getOutput() {
    return this.out_bus;
  }
};

