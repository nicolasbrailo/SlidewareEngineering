
// Create a filter with a ramp up and ramp down window of overlap %
// eg f(winlen=10, overlap=.3) -> [.3, .5, .7, 1, 1, 1, 1, .7, .5, .3]
function makeWindowOverlapRampFilter(winLen, overlap) {
  if (overlap <= 0 || overlap >= 1) {
    throw "No";
  }

  const overlapSamples = Math.floor(winLen * overlap);
  if (overlapSamples >= winLen / 2) {
    throw "No";
  }

  const rampUpStart   = winLen * 0;
  const rampUpEnd     = overlapSamples;
  const rampUpSlope = 1 / (rampUpEnd - rampUpStart);

  const rampDownStart = winLen - overlapSamples;
  const rampDownEnd   = winLen * 1;
  const rampDownSlope = 1 / (rampDownEnd - rampDownStart);

  const windowRampFilter = new Float32Array(winLen);
  for (let i=0; i < winLen; ++i) {
    if (i < rampUpEnd) {
      windowRampFilter[i] = i * rampUpSlope;
    } else if (i < rampDownStart) {
      windowRampFilter[i] = 1;
    } else {
      windowRampFilter[i] = (winLen - i - 1) * rampDownSlope;
    }
  }

  return {overlapSamples: overlapSamples, windowRampFilter: windowRampFilter};
}


class ExperimentProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'resampleFactor',
      defaultValue: 1,
      minValue: 0.1,
      maxValue: 3,
    },];
  }

  constructor() {
    super();
    this.port.onmessage = (x) => { this.onMessage(x); }
    this.stats = {
      framesProcessed: 0,
      frameDropped_badInputCount: 0,
      frameDropped_badOutputCount: 0,
      frameDropped_inputNotMono: 0,
      frameDropped_outputNotMono: 0,
      frameDropped_sampleCountMismatch: 0,

      frameSizeInSamples: 0,
      frameSizeChanges: 0,
    };

    this.audioStats = {
      lastInRMS: 0,
      lastOutRMS: 0,
      lastFrameFundamentalFreq: 0,
      xCorrs: 0,
    };

    this.resampleFactor = -1;
    this.resampledBuffer = [];
  }

  onMessage(msg) {
    if (msg.data == 'stats') {
      //console.log(this.audioStats);
    } else {
      console.log(`Unknown msg' ${msg}`);
    }
  }

  process (inputs, outputs, parameters) {
    if (inputs.length != 1) {
      this.stats.frameDropped_badInputCount++;
      return true;
    }

    if (inputs.length != outputs.length) {
      this.stats.frameDropped_badOutputCount++;
      return true;
    }

    if (inputs[0].length != 1) {
      this.stats.frameDropped_inputNotMono++;
      return true;
    }

    if (inputs[0].length != outputs[0].length) {
      this.stats.frameDropped_outputNotMono++;
      return true;
    }

    if (inputs[0][0].length != outputs[0][0].length) {
      this.stats.frameDropped_sampleCountMismatch++;
      return true;
    }

    const input = inputs[0][0];
    const output = outputs[0][0];

    if (input.length != this.stats.frameSizeInSamples) {
      this.stats.frameSizeInSamples = input.length;
      this.stats.frameSizeChanges++;
      this.onFrameSizeChanged(this.stats.frameSizeInSamples);
    }

    this.processMonoChannel(input.length, input, output);
    this.stats.framesProcessed++;
    return true;
  }

  onFrameSizeChanged(newFrameSize) {
    this.doubleBuff = new Float32Array(newFrameSize * 2);
    for (let i = 0; i < newFrameSize; ++i) {
      this.doubleBuff[i] = 0;
    }
  }

  processMonoChannel(nsamples, input, output) {
    // nsamples == 128
    for (let i=0; i < nsamples; ++i) {
      output[i] += (1-i/nsamples) * this.doubleBuff[nsamples + i];
    }
    for (let i=0; i < nsamples * 2; ++i) {
      const i_orig = i / 2;
      const i_orig_n0 = Math.floor(i_orig);
      const i_orig_n1 = Math.min(Math.ceil(i_orig), nsamples);
      const sample_orig_n0 = input[i_orig_n0];
      const sample_orig_n1 = input[i_orig_n1];
      this.doubleBuff[i] = (sample_orig_n0 + sample_orig_n1) / 2;
    }
    for (let i=0; i < nsamples; ++i) {
      output[i] += i/nsamples * this.doubleBuff[i];
    }
  }
}

registerProcessor('experiment', ExperimentProcessor)
