
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

    this.updateParams(parameters);
    this.processMonoChannel(input.length, input, output);
    this.stats.framesProcessed++;
    return true;
  }

  onFrameSizeChanged(newFrameSize) {
    const overlap = .25;
    // Resample based on doubling frame - overlap
    this.resampleFactor = 1 / (1 + (1 - overlap))
    this.overlapFilter = makeWindowOverlapRampFilter(newFrameSize, overlap);
    this.doublerBuffer = [];
  }

  updateParams(params) {
    if (params.resampleFactor[0] != this.resampleFactor) {
      //this.resampleFactor = params.resampleFactor[0];
    }
  }

  processMonoChannel(nsamples, input, output) {
    this.doubleFrame(nsamples, input, output);
    if (this.resampleFactor < 1) {
      this.antialiasLowpass(nsamples, input, output);
    }
    this.linearInterpolate(nsamples, input, output);
  }

  addOverlapFrame(nsamples, input) {
    const prevFrameOverlap = this.doublerBuffer.length - this.overlapFilter.overlapSamples;
    for (let i=0; i < nsamples; ++i) {
      if (i < this.overlapFilter.overlapSamples) {
        if (prevFrameOverlap >= 0) {
          this.doublerBuffer[prevFrameOverlap + i] += input[i] * this.overlapFilter.windowRampFilter[i];
        } else {
          this.doublerBuffer.push(input[i]);
        }
      } else {
        this.doublerBuffer.push(input[i] * this.overlapFilter.windowRampFilter[i]);
      }
    }
  }

  doubleFrame(nsamples, input, output) {
    this.addOverlapFrame(nsamples, input);
    this.addOverlapFrame(nsamples, input);

    if (this.doublerBuffer.length < output.length) {
      for (let i = 0; i < output.length; ++i) {
        output[i] = 0;
      }
      return;
    }

    for (let i = 0; i < nsamples; ++i) {
      output[i] = this.doublerBuffer[i];
    }

    this.doublerBuffer = this.doublerBuffer.splice(nsamples);
  }

  antialiasLowpass(nsamples, input, output) {
    // TODO
  }

  linearInterpolate(nsamples, input, output) {
    const resampledBufferLen = Math.ceil(this.resampleFactor * input.length);
    if (this.resampledBuffer.length != resampledBufferLen) {
      this.resampledBuffer = new Float32Array(resampledBufferLen);
      this.ringbuf = [];
    }

    for (let i = 0; i < this.resampledBuffer.length; ++i) {
      const i_orig = i / this.resampleFactor;
      const i_orig_n0 = Math.floor(i_orig);
      const i_orig_n1 = Math.ceil(i_orig) < input.length? Math.ceil(i_orig) : input.length-1;
      const sample_orig_n0 = input[i_orig_n0];
      const sample_orig_n1 = input[i_orig_n1];
      this.resampledBuffer[i] = (sample_orig_n0 + sample_orig_n1) / 2;
    }

    this.ringbuf = this.ringbuf.concat(Array.from(this.resampledBuffer));

    const zeroPadding = output.length > this.ringbuf.length? output.length - this.ringbuf.length : 0;
    for (let i = 0; i < zeroPadding; ++i) {
      output[i] = 0;
    }

    for (let i = zeroPadding; i < output.length; ++i) {
      output[i] = this.ringbuf[i - zeroPadding];
    }

    this.ringbuf = this.ringbuf.splice(output.length);
    this.audioStats.lastInRMS = this.ringbuf.length;
  }
}

registerProcessor('experiment', ExperimentProcessor)
