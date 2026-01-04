export class PSTNizer {
  constructor(audio_ctx) {
    this.audio_ctx = audio_ctx;

    this.hp = this.audio_ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.setValueAtTime(300, this.audio_ctx.currentTime);

    this.lp = this.audio_ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.setValueAtTime(3200, this.audio_ctx.currentTime);
    this.lp.gain.setValueAtTime(0.8, this.audio_ctx.currentTime);
    this.lp.Q.value = 0.9;

    this.mu_distorter = this.audio_ctx.createWaveShaper();
    this.mu_distorter.curve = this.makeMuDistortionCurve();

    this.compressor = this.audio_ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-50, this.audio_ctx.currentTime);
    this.compressor.knee.setValueAtTime(20, this.audio_ctx.currentTime);
    this.compressor.ratio.setValueAtTime(6, this.audio_ctx.currentTime);
    this.compressor.attack.setValueAtTime(0, this.audio_ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.audio_ctx.currentTime);

    this.noise = new AudioWorkletNode(this.audio_ctx, 'pinknoise');

    this.noise_gain = this.audio_ctx.createGain();
    this.noise_gain.gain.setValueAtTime(0.005, this.audio_ctx.currentTime);

    this.noise_hp = this.audio_ctx.createBiquadFilter();
    this.noise_hp.type = 'highpass';
    this.noise_hp.frequency.setValueAtTime(100, this.audio_ctx.currentTime);

    this.noise_lp = this.audio_ctx.createBiquadFilter();
    this.noise_lp.type = 'lowpass';
    this.noise_lp.frequency.setValueAtTime(5000, this.audio_ctx.currentTime);

    this.out_bus = this.audio_ctx.createGain();
    // Make up attenuation for the compressor
    this.out_bus.gain.setValueAtTime(.75, this.audio_ctx.currentTime);

    this.mono = this.audio_ctx.createChannelMerger(1);
  }

  makeMuDistortionCurve() {
    var n_samples = 256;
    var curve = new Float32Array(n_samples);
    for (var i=0; i < n_samples; ++i ) {
      var x = i * 2 / n_samples - 1;
      // Tweaked with http://kevincennis.github.io/transfergraph/
      curve[i] = (x * 400 * Math.PI / 180) / ( Math.PI + 4 * Math.abs(x) );
    }
    return curve;
  }

  disconnect() {
    this.lp.disconnect();
    this.hp.disconnect();
    this.noise.disconnect();
    this.noise_gain.disconnect();
    this.noise_lp.disconnect();
    this.noise_hp.disconnect();
    this.out_bus.disconnect();
    this.mono.disconnect();
  }

  connectInput(src) {
    this.disconnect();

    // Simulate low snr
    this.noise.connect(this.noise_lp);
    this.noise_lp.connect(this.noise_hp);
    this.noise_hp.connect(this.noise_gain);
    this.noise_gain.connect(this.out_bus);

    // Bandpass and mu-law for input audio
    src.connect(this.lp);
    this.lp.connect(this.hp);
    this.hp.connect(this.compressor);
    this.compressor.connect(this.mu_distorter);
    this.mu_distorter.connect(this.out_bus);

    this.out_bus.connect(this.mono);
  }

  getOutput() {
    return this.mono;
  }
};
