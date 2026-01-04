class FrameDropperProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'drop_n',
      defaultValue: 0,
      minValue: 0,
      maxValue: 9999999,
    },{
      name: 'group_size',
      defaultValue: 30,
      minValue: 1,
      maxValue: 9999999,
    }];
  }

  constructor() {
    super();
    this.stats = [];
  }

  process (inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (this.stats.length != input.length) {
      this.stats = [];
      while (this.stats.length < input.length) {
        this.stats.push({dropped: 0, kept: 0});
      }
    }

    const drop_n = parameters.drop_n[0];
    const group_size = parameters.group_size[0];

    for (let channel = 0; channel < input.length; ++channel) {
      for (let i = 0; i < input[channel].length; ++i) {
        if ((this.stats[channel].kept + this.stats[channel].dropped) >= group_size) {
          this.stats[channel].dropped = 0;
          this.stats[channel].kept = 0;
        }

        if (this.stats[channel].dropped < drop_n) {
          output[channel][i] = 0;
          this.stats[channel].dropped += 1;
        } else if ((this.stats[channel].kept + this.stats[channel].dropped) < group_size) {
          output[channel][i] = input[channel][i];
          this.stats[channel].kept += 1;
        }
      }
    }

    return true
  }
}

registerProcessor('framedropper', FrameDropperProcessor)

