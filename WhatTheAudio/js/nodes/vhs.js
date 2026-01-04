import {fromDb} from '../audioHelpers.js';

export class VHSEffect {
  constructor(ctx) {
    this.pinknoise = new AudioWorkletNode(ctx, 'pinknoise');
    this.pinknoise.parameters.get('gain').setValueAtTime(fromDb(-40), 0);

    this.bd = new AudioWorkletNode(ctx, 'bitwidth');
    this.bd.parameters.get('bitwidth').setValueAtTime(8, 0);

    this.vhs_hp = ctx.createBiquadFilter();
    this.vhs_hp.type = 'highpass';
    this.vhs_hp.frequency.setValueAtTime(300, ctx.currentTime);
    this.vhs_hp.Q.value = 0.5;

    this.vhs_lp = ctx.createBiquadFilter();
    this.vhs_lp.type = 'lowpass';
    this.vhs_hp.Q.value = 5;
    this.vhs_lp.frequency.setValueAtTime(10000, ctx.currentTime);

    this.vhs_saw = ctx.createOscillator();
    this.vhs_saw.frequency.setValueAtTime(60, ctx.currentTime);
    this.vhs_saw.type = "sawtooth";
    this.vhs_saw.start();

    this.vhs_saw_gain = ctx.createGain();
    this.vhs_saw_gain.gain.setValueAtTime(fromDb(-38), 0);

    this.out_bus = ctx.createGain();
    this.out_bus.gain.setValueAtTime(1, ctx.currentTime);
  }

  disconnect() {
    this.pinknoise.disconnect();
    this.bd.disconnect();
    this.vhs_hp.disconnect();
    this.vhs_lp.disconnect();
    this.vhs_saw.disconnect();
    this.vhs_saw_gain.disconnect();
  }

  connectInput(src) {
    src.connect(this.vhs_hp);
    this.vhs_hp.connect(this.vhs_lp);
    this.vhs_lp.connect(this.bd);
    this.bd.connect(this.out_bus);
    this.pinknoise.connect(this.out_bus);
    this.vhs_saw.connect(this.vhs_saw_gain);
    this.vhs_saw_gain.connect(this.out_bus);
  }

  getOutput() {
    return this.out_bus;
  }
};
