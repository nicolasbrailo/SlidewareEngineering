class BitWidthProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'bitwidth',
      defaultValue: 16,
      minValue: 0,
      maxValue: 16,
    },];
  }

  constructor() {
    super();
    this.stats = [];
  }

  process (inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const bw = 16 - parameters.bitwidth[0];

    function F32toS16(sample) {
      if (sample > 1) sample = 1;
      if (sample < -1) sample = -1;
      // Does JS have subnormals?
      return Math.round((2**15) * sample);
    }

    function S16toF32(sample) {
      return sample / (2**15);
    }

    const requantize = (sample, bw) => {
      const mask = ~((2**bw)-1);
      return S16toF32(F32toS16(sample) & mask);
    }

    for (let channel = 0; channel < input.length; ++channel) {
      for (let i = 0; i < input[channel].length; ++i) {
        output[channel][i] = requantize(input[channel][i], bw);
      }
    }

    return true
  }
}

registerProcessor('bitwidth', BitWidthProcessor)
