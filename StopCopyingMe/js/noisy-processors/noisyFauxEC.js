function _dbToLin(db) {
  return Math.pow(10, db / 20);
}

// Base strategy class
class Strategy {
  constructor(fauxecState) { this.fauxecState = fauxecState; }
  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame, testSignalFrame) {
    // testSignalFrame: optional output for test signals (e.g., RIR measurement)
    // Default: silence on test signal output
    throw new Error('Strategy.onFrame must be implemented');
  }
  onMessage(type, value) { }
  onSelected() {}
  getStats() { return {}; }
  getDebugTracks() { return []; }
}

class PassthroughStrategy extends Strategy {
  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame) {
    for (let i = 0; i < nSamples; i++) {
      outFrame[i] = nearEndFrame[i];
    }
  }
}

class SilenceMicStrategy extends Strategy {
  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame) {
    for (let i = 0; i < nSamples; i++) {
      outFrame[i] = 0;
    }
  }
}

class TestToneStrategy extends Strategy {
  constructor(fauxecState) {
    super(fauxecState);
    this.phase = 0;
  }
  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame) {
    for (let i = 0; i < nSamples; i++) {
      outFrame[i] = nearEndFrame[i] + 0.1 * Math.sin(880 * (i + this.phase) / sampleRate);
    }
    this.phase = (this.phase + nSamples) % sampleRate;
  }
}

class NaiveSubtractStrategy extends Strategy {
  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame) {
    for (let i = 0; i < nSamples; i++) {
      outFrame[i] = nearEndFrame[i] - farEndFrame[i];
    }
  }
}

class XCorrHelper {
  static getDefaultCfg() {
    return {
      minDelayMs: 80,
      updateIntervalFrames: 1000, // 2ish seconds
      echoTimeWindowSizeMs: 500,
      stepSize: 48,
      txThresholdDb: -40,
      rxThresholdDb: -24,
      smoothingAlpha: 0.5,
      nxcThreshold: 0.55,
      xcorrWindowSize: 1024,
      echoAttenuation: 0.3,
    };
  }

  constructor(config) {
    const required = [
      'echoTimeWindowSizeMs', 'updateIntervalFrames', 'minDelayMs', 'stepSize',
      'txThresholdDb', 'rxThresholdDb', 'smoothingAlpha', 'nxcThreshold', 'xcorrWindowSize'
    ];
    const missing = required.filter(k => config[k] === undefined);
    if (missing.length > 0) {
      throw new Error(`XCorrHelper: missing required config: ${missing.join(', ')}`);
    }

    this.echoTimeWindowSizeMs = config.echoTimeWindowSizeMs;
    this.updateIntervalFrames = config.updateIntervalFrames;
    this.minDelayMs = config.minDelayMs;
    this.stepSize = config.stepSize;
    this.txThresholdLin = _dbToLin(config.txThresholdDb);
    this.rxThresholdLin = _dbToLin(config.rxThresholdDb);
    this.smoothingAlpha = config.smoothingAlpha;
    this.nxcThreshold = config.nxcThreshold;
    this.xcorrWindowSize = config.xcorrWindowSize;

    // Derived values
    this.bufferSize = Math.floor(sampleRate * this.echoTimeWindowSizeMs / 1000);
    this.minDelay = Math.floor(sampleRate * this.minDelayMs / 1000);

    // Stats
    this.delayUpdateCountRejectedNoTx = 0;
    this.delayUpdateCountRejectedNoRx = 0;
    this.delayUpdateCountRejectedPoorXCorr = 0;
    this.delayUpdateCount = 0;
    this.lastXCorrScore = 0;

    // State
    this.nearEndBuffer = new Float32Array(this.bufferSize);
    this.farEndBuffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.delay = this.minDelay;
    this.frameCounter = 0;
    this.foundXC = false;
  }

  updateConfig(config) {
    // Update all configurable parameters
    if (config.echoTimeWindowSizeMs !== undefined && config.echoTimeWindowSizeMs !== this.echoTimeWindowSizeMs) {
      this.echoTimeWindowSizeMs = config.echoTimeWindowSizeMs;
      this.bufferSize = Math.floor(sampleRate * this.echoTimeWindowSizeMs / 1000);
      this.nearEndBuffer = new Float32Array(this.bufferSize);
      this.farEndBuffer = new Float32Array(this.bufferSize);
      this.writePos = 0;
    }
    if (config.updateIntervalFrames !== undefined) {
      this.updateIntervalFrames = config.updateIntervalFrames;
    }
    if (config.minDelayMs !== undefined) {
      this.minDelayMs = config.minDelayMs;
      this.minDelay = Math.floor(sampleRate * this.minDelayMs / 1000);
      this.delay = Math.max(this.delay, this.minDelay);
    }
    if (config.stepSize !== undefined) {
      this.stepSize = config.stepSize;
    }
    if (config.txThresholdDb !== undefined) {
      this.txThresholdLin = _dbToLin(config.txThresholdDb);
    }
    if (config.rxThresholdDb !== undefined) {
      this.rxThresholdLin = _dbToLin(config.rxThresholdDb);
    }
    if (config.smoothingAlpha !== undefined) {
      this.smoothingAlpha = config.smoothingAlpha;
    }
    if (config.nxcThreshold !== undefined) {
      this.nxcThreshold = config.nxcThreshold;
    }
    if (config.xcorrWindowSize !== undefined) {
      this.xcorrWindowSize = config.xcorrWindowSize;
    }
  }

  addFrame(nearEndFrame, farEndFrame) {
    const nSamples = nearEndFrame.length;
    for (let i = 0; i < nSamples; i++) {
      this.nearEndBuffer[this.writePos] = nearEndFrame[i];
      this.farEndBuffer[this.writePos] = farEndFrame[i];
      this.writePos = (this.writePos + 1) % this.bufferSize;
    }
    this.frameCounter++;
    if (this.frameCounter >= this.updateIntervalFrames) {
      this.frameCounter = 0;
      this.updateDelay();
    }
  }

  haveEnoughSignalForXCorr() {
    // Energy gate: skip if either buffer is too quiet
    const numSamples = Math.min(this.xcorrWindowSize, this.bufferSize);
    let txE = 0, rxE = 0;
    for (let i = 0; i < numSamples; i++) {
      const idx = (this.writePos - 1 - i + this.bufferSize) % this.bufferSize;
      txE += this.nearEndBuffer[idx] * this.nearEndBuffer[idx];
      rxE += this.farEndBuffer[idx] * this.farEndBuffer[idx];
    }
    txE = Math.sqrt(txE / numSamples);
    rxE = Math.sqrt(rxE / numSamples);

    // Expect mic signal to be lower than speaker signal, and only update if
    // 1. there is signal in the playback (rx)
    // 2. There is signal in the mic (tx)
    if (txE < this.txThresholdLin) {
      this.delayUpdateCountRejectedNoTx++;
      return false;
    }
    if (rxE < this.rxThresholdLin) {
      this.delayUpdateCountRejectedNoRx++;
      return false;
    }
    // 3. We could reject if the mic tx is quieter than rx (it means what we receive MAY be echo,
    //    if it's higher then there is likely active signal on the near end and we shouldn't update
    //    the delay at this time) but this can be quite noisy (we don't know the delay, and if it's
    //    large enough we'll be comparing current TX to long gone RX, missing the RMS window) and
    //    it's not necessary (the xcorr number will be low anyway, we just waste some cycles)
    return true;
  }

  _computeNCC(delay, windowSize) {
    let corr = 0, nearE = 0, farE = 0;
    const numSamples = Math.min(windowSize, this.bufferSize - delay);
    for (let i = 0; i < numSamples; i++) {
      const nearIdx = (this.writePos - 1 - i + this.bufferSize) % this.bufferSize;
      const farIdx = (this.writePos - 1 - i - delay + this.bufferSize) % this.bufferSize;
      const n = this.nearEndBuffer[nearIdx];
      const f = this.farEndBuffer[farIdx];
      corr += n * f;
      nearE += n * n;
      farE += f * f;
    }
    const denom = Math.sqrt(nearE * farE);
    return denom > 0 ? corr / denom : 0;
  }

  updateDelay() {
    if (!this.haveEnoughSignalForXCorr()) {
      return;
    }

    const windowSize = Math.min(this.xcorrWindowSize, this.bufferSize);
    const maxDelay = this.bufferSize - this.minDelay;

    // Phase 1: Coarse search with configurable step size. This gives us a rough idea
    // of where the best correlation is, without spending too many cycles on the exact sample
    let bestNXC = -Infinity;
    let coarseDelay = 0;
    for (let d = this.minDelay; d < maxDelay; d += this.stepSize) {
      const ncc = this._computeNCC(d, windowSize);
      if (ncc > bestNXC) {
        bestNXC = ncc;
        coarseDelay = d;
      }
    }

    // Phase 2: Fine search to better estimate alignment, hopefuly producing more stable results
    const fineStep = 12;
    const fineStart = Math.max(this.minDelay, coarseDelay - this.stepSize);
    const fineEnd = Math.min(maxDelay, coarseDelay + this.stepSize);
    let bestDelay = coarseDelay;
    for (let d = fineStart; d < fineEnd; d += fineStep) {
      const ncc = this._computeNCC(d, windowSize);
      if (ncc > bestNXC) {
        bestNXC = ncc;
        bestDelay = d;
      }
    }

    this.lastXCorrScore = bestNXC;
    if (bestNXC < this.nxcThreshold) {
      this.delayUpdateCountRejectedPoorXCorr++;
      return;
    }

    this.delayUpdateCount++;
    // Exponential smoothing, clamped to minDelay
    const smoothed = this.smoothingAlpha * bestDelay + (1 - this.smoothingAlpha) * this.delay;
    this.delay = Math.max(smoothed, this.minDelay);
    this.delay = bestDelay;
    this.foundXC = true;
  }

  getDelaySamples() {
    return this.delay;
  }

  getStats() {
    return {
      delayMs: (this.delay / sampleRate) * 1000,
      xcLock: this.foundXC,
      xcNoTx: this.delayUpdateCountRejectedNoTx,
      xcNoRx: this.delayUpdateCountRejectedNoRx,
      xcPoorXCorr: this.delayUpdateCountRejectedPoorXCorr,
      xcUpdate: this.delayUpdateCount,
      xcScore: this.lastXCorrScore,
    };
  }
}

class HalfDuplexStrategy extends Strategy {
  static getDefaultCfg() {
    return {
      attackMs: 10,
      decayMs: 200,
      thresholdDb: -20,
    };
  }

  constructor(fauxecState) {
    super(fauxecState);
    this.config = HalfDuplexStrategy.getDefaultCfg();
    this.farEndLevel = 0;
    this.gatedFrames = 0;
    this.gated = false;
  }

  onMessage(type, value) {
    if (type === 'halfDuplex_config') {
      Object.assign(this.config, value);
    }
  }

  getStats() {
    return {
      gatedFrames: this.gatedFrames,
      attackSamples: sampleRate * this.config.attackMs / 1000,
      decaySamples: sampleRate * this.config.decayMs / 1000,
    };
  }

  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame) {
    // Convert time to smoothing coefficient: 1 - e^(-frameTime / tau)
    const frameTime = nSamples / sampleRate;

    let ss = 0;
    for (let i = 0; i < nSamples; ++i) ss += farEndFrame[i] * farEndFrame[i];
    const rms = Math.sqrt(ss / nSamples);

    // Apply attack/decay smoothing
    const coeff = rms > this.farEndLevel ?
                      1 - Math.exp(-frameTime / (this.config.attackMs / 1000)) :
                      1 - Math.exp(-frameTime / (this.config.decayMs / 1000));

    this.farEndLevel += coeff * (rms - this.farEndLevel);

    const threshold = Math.pow(10, this.config.thresholdDb / 20);
    const shouldGate = this.farEndLevel > threshold;
    if (shouldGate !== this.gated) {
      this.gated = shouldGate;
      this.fauxecState.port.postMessage({ type: 'gated', value: shouldGate });
    }
    if (shouldGate) {
      this.gatedFrames++;
      for (let i = 0; i < nSamples; i++) {
        outFrame[i] = 0;
      }
    } else {
      for (let i = 0; i < nSamples; i++) {
        outFrame[i] = nearEndFrame[i];
      }
    }
  }
}

class TimeAlignedSubtractStrategy extends Strategy {
  constructor(fauxecState) {
    super(fauxecState);
    this.config = XCorrHelper.getDefaultCfg();
    this.xCorr = new XCorrHelper(this.config);

    this.bufferSize = Math.floor(sampleRate * this.config.echoTimeWindowSizeMs / 1000);
    this.farEndBuffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.lastDelay = 0;

    // Debug track for aligned far-end (strategy-specific)
    this.debugAlignedFarEnd = null;
    this.debugWritePos = 0;
  }

  startDebugRecording() {
    const maxSamples = this.fauxecState.debugMaxSamples;
    this.debugAlignedFarEnd = new Float32Array(maxSamples);
    this.debugWritePos = 0;
  }

  stopDebugRecording() {
    const result = this.debugAlignedFarEnd ? this.debugAlignedFarEnd.slice(0, this.debugWritePos) : null;
    this.debugAlignedFarEnd = null;
    this.debugWritePos = 0;
    return result;
  }

  getDebugTracks() {
    const samples = this.stopDebugRecording();
    return samples ? [['alignedFarEnd.wav', samples]] : [];
  }

  updateConfig(newConfig) {
    const oldEchoWindowMs = this.config.echoTimeWindowSizeMs;
    Object.assign(this.config, newConfig);
    this.xCorr.updateConfig(this.config);

    // Resize buffer if echoTimeWindowSizeMs changed
    if (newConfig.echoTimeWindowSizeMs !== undefined && newConfig.echoTimeWindowSizeMs !== oldEchoWindowMs) {
      this.bufferSize = Math.floor(sampleRate * this.config.echoTimeWindowSizeMs / 1000);
      this.farEndBuffer = new Float32Array(this.bufferSize);
      this.writePos = 0;
    }
  }

  onMessage(type, value) {
    if (type === 'timeAligned_config') {
      this.updateConfig(value);
    }
  }

  getStats() {
    return this.xCorr.getStats();
  }

  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame) {
    this.xCorr.addFrame(nearEndFrame, farEndFrame);

    for (let i = 0; i < nSamples; i++) {
      this.farEndBuffer[this.writePos] = farEndFrame[i];
      this.writePos = (this.writePos + 1) % this.bufferSize;
    }

    if (!this.xCorr.foundXC) {
      // Zero out until an xcorr can be found
      for (let i = 0; i < nSamples; i++) outFrame[i] = 0;
      return;
    }

    const delay = this.xCorr.getDelaySamples();
    if (Math.abs(delay - this.lastDelay) > 48) {
      console.log(`Delay jumped from ${this.lastDelay} to ${delay} (${((delay - this.lastDelay) / sampleRate * 1000).toFixed(2)}ms)`);
      this.lastDelay = delay;
    }

    // Read from buffer position that was written $delay samples ago
    // writePos now points to where we'll write next, so the sample we just wrote is at writePos-1
    const clampedDelay = Math.min(this.lastDelay, this.bufferSize - 1);
    const readStart = (this.writePos - nSamples - clampedDelay + this.bufferSize * 5) % this.bufferSize;
    const attenuation = this.config.echoAttenuation;
    const recording = this.fauxecState.debugRecording && this.debugAlignedFarEnd;

    for (let i = 0; i < nSamples; i++) {
      const readI = (readStart + i) % this.bufferSize;
      const alignedFarEnd = attenuation * this.farEndBuffer[readI];
      outFrame[i] = nearEndFrame[i] - alignedFarEnd;

      // Record aligned far-end if debug recording active
      if (recording && this.debugWritePos < this.fauxecState.debugMaxSamples) {
        this.debugAlignedFarEnd[this.debugWritePos] = alignedFarEnd;
        this.debugWritePos++;
      }
    }
  }
}

class IRMeasurementHelperMock {
  getStats() {
    return {
      irComplete: false,
    }
  }
  getDebugTracks() { return []; }
  onFrame(nSamples, nearEndFrame, testSignalFrame) {}
}

class IRMeasurementHelper {
  constructor(config) {
    this.signalType = config.testSignalType;
    this.irLength = config.irLength;
    this.measureSamples = Math.floor(sampleRate * config.measurementDurationMs / 1000);

    // Generate test signal based on type
    if (config.testSignalType === 'mls') {
      this.testSignal = this._generateMLS(config.mlsOrder);
    } else if (config.testSignalType === 'dirac_sine') {
      this.testSignal = this._generateDirac(config.diracPulseWidth, 'sine');
    } else if (config.testSignalType === 'dirac_square') {
      this.testSignal = this._generateDirac(config.diracPulseWidth, 'square');
    } else {
      throw new Error(`Invalid test signal type ${config.testSignalType}`);
    }

    // Precompute test signal energy for normalization
    this.testSignalEnergy = 0;
    for (let i = 0; i < this.testSignal.length; i++) {
      this.testSignalEnergy += this.testSignal[i] * this.testSignal[i];
    }

    // Measurement state
    this.recordBuffer = new Float32Array(this.measureSamples);
    this.recordPos = 0;
    this.playPos = 0;

    // Result
    this.ir = new Float32Array(this.irLength);
    this.irTrimmed = null;
    this.irDelayOffset = 0;
    this.ready = false;
    this.irAcquired = false;
    this.peakValue = 0;
    this.peakDelayMs = 0;
    this.crestFactor = 0;
    this.peakAtBoundary = false;
    this.debugPeakSum = 0;
    this.debugRecordRms = 0;
    this.irSumBeforeNorm = 0;
  }

  getStats() {
    return {
      irComplete: this.ready,
      irAcquired: this.irAcquired,
      irPeak: this.peakValue.toFixed(4),
      irDelayMs: this.peakDelayMs.toFixed(1),
      irCrestFactor: this.crestFactor.toFixed(1),
      irPeakAtBoundary: this.peakAtBoundary,
      irTestEnergy: this.testSignalEnergy.toFixed(1),
      irRecordRms: this.debugRecordRms.toFixed(4),
      irPeakSum: this.debugPeakSum.toFixed(4),
      irSignal: this.signalType,
      irMeasSz: this.measureSamples,
      irSz: this.irLength,
      irTrimmedSz: this.irTrimmed ? this.irTrimmed.length : 0,
      irDelayOffset: this.irDelayOffset,
      irSumPreNorm: this.irSumBeforeNorm ? this.irSumBeforeNorm.toFixed(2) : 0,
    };
  }

  getDebugTracks() {
    return [
      ['ir_test_signal.wav', this.testSignal],
      ['ir_measured.wav', this.recordBuffer],
      ['ir_estimated.wav', this.ir],
    ];
  }

  _generateDirac(widthSamples, signalType) {
   // Pad with some silence before and after, in case playback isn't hooked up yet
    const silencePadSamples = sampleRate / 4;
    const len = widthSamples + 2 * silencePadSamples;
    const pulse = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      if (i < silencePadSamples || i > silencePadSamples + widthSamples) {
        pulse[i] = 0;
      } else {
        const j = i - silencePadSamples;
        if (signalType === 'sine') {
          // Half-sine window: smooth onset/offset, speaker-friendly
          pulse[i] = Math.sin(Math.PI * j / widthSamples);
        } else if (signalType === 'square') {
          pulse[i] = (j < widthSamples / 2)? -.8 : .8;
        } else {
          throw new Error('Unsuported signal type for Dirac-like RIR signal test');
        }
      }
    }
    return pulse;
  }

  // Generate Maximum Length Sequence using Galois LFSR
  _generateMLS(order) {
    const len = (1 << order) - 1;
    const mls = new Float32Array(len);

    const taps = {
      10: (1 << 9) | (1 << 6),
      12: (1 << 11) | (1 << 5) | (1 << 3) | (1 << 0),
      14: (1 << 13) | (1 << 4) | (1 << 2) | (1 << 0),
      16: (1 << 15) | (1 << 14) | (1 << 12) | (1 << 3),
    };

    const tap = taps[order] || taps[14];
    let lfsr = 1;

    for (let i = 0; i < len; i++) {
      const bit = lfsr & 1;
      mls[i] = bit ? 0.5 : -0.5;
      lfsr >>= 1;
      if (bit) lfsr ^= tap;
    }

    return mls;
  }

  onFrame(nSamples, nearEndFrame, testSignalFrame) {
    if (this.ready) return false;

    for (let i = 0; i < nSamples; i++) {
      if (this.recordPos >= this.measureSamples) continue;

      // Output test signal (silence after signal ends)
      if (testSignalFrame) {
        testSignalFrame[i] = this.playPos < this.testSignal.length
          ? this.testSignal[this.playPos]
          : 0;
        this.playPos++;
      }

      // Record near-end
      this.recordBuffer[this.recordPos++] = nearEndFrame[i];
    }

    // Check if measurement complete
    if (this.recordPos >= this.measureSamples) {
      this._computeIR();
    }
  }

  _computeIR() {
    const irLen = this.irLength;
    const ir = new Float32Array(irLen);
    const testSig = this.testSignal;
    const recordLen = this.recordPos;

    // Compute recording RMS for debug
    let recSumSq = 0;
    for (let i = 0; i < recordLen; i++) {
      recSumSq += this.recordBuffer[i] * this.recordBuffer[i];
    }
    this.debugRecordRms = Math.sqrt(recSumSq / recordLen);
    if (this.debugRecordRms < .005) {
      this.irTrimmed = new Float32Array(0);
      this.ready = true;
      return;
    }

    // Cross-correlation: IR[k] = sum(recorded[n] * testSig[n-k]) / energy
    let maxSum = 0;
    for (let k = 0; k < irLen; k++) {
      let sum = 0;
      for (let n = k; n < recordLen; n++) {
        const testIdx = n - k;
        if (testIdx < testSig.length) {
          sum += this.recordBuffer[n] * testSig[testIdx];
        }
      }
      ir[k] = sum / this.testSignalEnergy;
      if (Math.abs(sum) > Math.abs(maxSum)) maxSum = sum;
    }
    this.debugPeakSum = maxSum;

    // Find peak and compute RMS for crest factor
    let peakVal = 0, peakIdx = 0, sumSq = 0;
    for (let i = 0; i < irLen; i++) {
      const absVal = Math.abs(ir[i]);
      if (absVal > peakVal) {
        peakVal = absVal;
        peakIdx = i;
      }
      sumSq += ir[i] * ir[i];
    }
    const rms = Math.sqrt(sumSq / irLen);

    this.ir = ir;
    this.peakValue = peakVal;
    this.peakDelayMs = (peakIdx / sampleRate) * 1000;
    this.crestFactor = rms > 0 ? peakVal / rms : 0;
    this.peakAtBoundary = peakIdx > irLen * 0.95;

    // Create sparse IR: delay offset + trimmed IR starting before peak
    // Start a few ms before peak to capture any pre-echo, but at least at index 0
    const preEchoSamples = Math.floor(sampleRate * 0.005); // 5ms pre-echo margin
    this.irDelayOffset = Math.max(0, peakIdx - preEchoSamples);

    // Find tail cutoff: where IR decays below x% of peak
    const tailThreshold = peakVal * 0.1;
    let tailEnd = irLen;
    for (let i = irLen - 1; i > peakIdx; i--) {
      if (Math.abs(ir[i]) > tailThreshold) {
        tailEnd = Math.min(irLen, i + Math.floor(sampleRate * 0.010)); // 10ms safety margin
        break;
      }
    }

    const trimmedLen = tailEnd - this.irDelayOffset;
    this.irTrimmed = new Float32Array(trimmedLen);
    for (let i = 0; i < trimmedLen; i++) {
      this.irTrimmed[i] = ir[this.irDelayOffset + i];
    }

    // Normalize IR by L1 norm (sum of absolute values) to bound max gain
    // This prevents gain blowup when convolving with correlated signals
    let irL1 = 0;
    for (let i = 0; i < trimmedLen; i++) {
      irL1 += Math.abs(this.irTrimmed[i]);
    }
    this.irSumBeforeNorm = irL1;
    if (irL1 > 1e-6) {
      const normFactor = 1.0 / irL1;
      for (let i = 0; i < trimmedLen; i++) {
        this.irTrimmed[i] *= normFactor;
      }
    }

    this.ready = true;
    this.irAcquired = true;
  }
}

class RIRStrategy extends Strategy {
  static getDefaultCfg() {
    return {
      irLength: 20480,             // Impulse response length (~427ms at 48kHz)
      measurementDurationMs: 1000, // How long to measure
      testSignalType: 'dirac_square',
      diracPulseWidth: 48,         // Pulse width in samples
      mlsOrder: 14,                // MLS order, only used if testSignalType='mls'
      echoAttenuation: 1.0,        // Scale factor for echo subtraction
    };
  }

  constructor(fauxecState) {
    super(fauxecState);
    this.config = RIRStrategy.getDefaultCfg();
    this.rir = new IRMeasurementHelperMock();
    this.farEndDelayLine = new Float32Array(this.config.irLength);
    this.farEndDelayPos = 0;

    // Debug recording for echo estimate
    this.debugEchoEstimate = null;
    this.debugWritePos = 0;
  }

  startDebugRecording() {
    const maxSamples = this.fauxecState.debugMaxSamples;
    this.debugEchoEstimate = new Float32Array(maxSamples);
    this.debugWritePos = 0;
  }

  getDebugTracks() {
    const tracks = [
      ...this.rir.getDebugTracks(),
      ['far_end_delay_line.wav', this.farEndDelayLine]
    ];
    if (this.debugEchoEstimate) {
      tracks.push(['echo_estimate.wav', this.debugEchoEstimate.slice(0, this.debugWritePos)]);
      this.debugEchoEstimate = null;
      this.debugWritePos = 0;
    }
    return tracks;
  }

  onSelected() {
    // Restart measurement every time we're selected
    this.rir = new IRMeasurementHelper(this.config);
  }

  onMessage(type, value) {
    if (type === 'rir_config') {
      Object.assign(this.config, value);
      this.onSelected();
    }
  }

  getStats() {
    return this.rir.getStats();
  }

  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame, testSignalFrame) {
    if (!this.rir.ready) {
      // Measuring RIR - mute output
      this.rir.onFrame(nSamples, nearEndFrame, testSignalFrame);
      for (let i = 0; i < nSamples; i++) outFrame[i] = 0;

      // Initialize FIR buffer when measurement completes
      if (this.rir.ready) {
        this.farEndDelayLine = new Float32Array(this.rir.ir.length);
        this.farEndDelayPos = 0;
      }
      return;
    }

    // Apply sparse FIR filter for echo cancellation
    // Uses trimmed IR (skips leading zeros) for ~10x speedup
    const atten = this.config.echoAttenuation;
    const irTrimmed = this.rir.irTrimmed;
    const irDelayOffset = this.rir.irDelayOffset;
    const trimmedLen = irTrimmed.length;
    const delayLineLen = this.farEndDelayLine.length;

    for (let i = 0; i < nSamples; i++) {
      // Write far-end to circular buffer
      this.farEndDelayPos = (this.farEndDelayPos + 1) % delayLineLen;
      this.farEndDelayLine[this.farEndDelayPos] = farEndFrame[i];

      // Convolve far-end with trimmed IR to estimate echo
      // irTrimmed[k] corresponds to original ir[irDelayOffset + k]
      let echoEstimate = 0;
      for (let k = 0; k < trimmedLen; k++) {
        const delayIdx = (this.farEndDelayPos - irDelayOffset - k + 5*delayLineLen) % delayLineLen;
        echoEstimate += irTrimmed[k] * this.farEndDelayLine[delayIdx];
      }

      // Record echo estimate if debug recording active
      if (this.debugEchoEstimate && this.debugWritePos < this.fauxecState.debugMaxSamples) {
        this.debugEchoEstimate[this.debugWritePos++] = echoEstimate;
      }

      // Subtract estimated echo
      outFrame[i] = nearEndFrame[i] - atten * echoEstimate;
    }
  }
}

class NLMSStrategy extends Strategy {
  static getDefaultCfg() {
    return {
      filterLength: 4096,       // Number of taps (~85ms at 48kHz)
      stepSize: 0.5,            // NLMS step size (mu), 0.1-1.0 typical
      epsilon: 1e-8,            // Regularization to prevent division by zero
      leakage: 0.9999,          // Leaky LMS coefficient (1.0 = no leakage)
      minDelayMs: 50,           // Minimum expected delay (skip early taps)
    };
  }

  constructor(fauxecState) {
    super(fauxecState);
    this.config = NLMSStrategy.getDefaultCfg();
    this.initFilter();

    // Stats
    this.filterUpdates = 0;
    this.maxCoeff = 0;
    this.peakTap = 0;
  }

  initFilter() {
    const len = this.config.filterLength;
    this.h = new Float32Array(len);           // Adaptive filter coefficients
    this.xBuf = new Float32Array(len);        // Far-end signal buffer (delay line)
    this.xBufPos = 0;                         // Current position in circular buffer
    this.minDelaySamples = Math.floor(sampleRate * this.config.minDelayMs / 1000);
  }

  onMessage(type, value) {
    if (type === 'nlms_config') {
      const oldLen = this.config.filterLength;
      Object.assign(this.config, value);
      if (value.filterLength !== undefined && value.filterLength !== oldLen) {
        this.initFilter();
      }
      if (value.minDelayMs !== undefined) {
        this.minDelaySamples = Math.floor(sampleRate * this.config.minDelayMs / 1000);
      }
    } else if (type === 'nlms_reset') {
      this.initFilter();
    }
  }

  getStats() {
    return {
      nlmsUpdates: this.filterUpdates,
      nlmsMaxCoeff: this.maxCoeff,
      nlmsPeakTap: this.peakTap,
      nlmsPeakDelayMs: (this.peakTap / sampleRate) * 1000,
    };
  }

  onFrame(nSamples, nearEndFrame, farEndFrame, outFrame) {
    const { h, xBuf } = this;
    const len = this.config.filterLength;
    const mu = this.config.stepSize;
    const eps = this.config.epsilon;
    const leakage = this.config.leakage;
    const minDelay = this.minDelaySamples;

    for (let i = 0; i < nSamples; i++) {
      // Write new far-end sample to circular buffer
      this.xBufPos = (this.xBufPos + 1) % len;
      xBuf[this.xBufPos] = farEndFrame[i];

      // Compute estimated echo: y_hat = h * x (convolution)
      // and input power for normalization
      let yHat = 0;
      let xPower = 0;
      for (let j = minDelay; j < len; j++) {
        const xIdx = (this.xBufPos - j + len) % len;
        const xVal = xBuf[xIdx];
        yHat += h[j] * xVal;
        xPower += xVal * xVal;
      }

      // Error = near-end (desired) - estimated echo
      const error = nearEndFrame[i] - yHat;
      outFrame[i] = error;

      // NLMS update: h[j] += (mu / (eps + ||x||^2)) * error * x[n-j]
      const normFactor = mu / (eps + xPower);
      for (let j = minDelay; j < len; j++) {
        const xIdx = (this.xBufPos - j + len) % len;
        // Leaky LMS: slight decay prevents coefficient drift
        h[j] = leakage * h[j] + normFactor * error * xBuf[xIdx];
      }

      this.filterUpdates++;
    }

    // Update stats periodically (find peak coefficient)
    if (this.filterUpdates % 10000 < nSamples) {
      let maxVal = 0;
      let maxIdx = 0;
      for (let j = 0; j < len; j++) {
        const absVal = Math.abs(h[j]);
        if (absVal > maxVal) {
          maxVal = absVal;
          maxIdx = j;
        }
      }
      this.maxCoeff = maxVal;
      this.peakTap = maxIdx;
    }
  }
}



class NoisyFauxECProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mode = 'passthrough';
    this.processingTimeHistory = [];

    // Debug recording (30 seconds max)
    const debugMaxSamples = sampleRate * 30;

    // Frame buffering config: process multiple 128-sample frames at once
    const bufferFrameCount = 1;
    const renderQuantum = 128; // nSamples, hardcoded by WebAudio API spec
    const bufferSize = bufferFrameCount * renderQuantum;

    this.fauxecState = {
      stats: {
        frames: 0,
        xruns: 0,
      },
      port: this.port,
      debugRecording: false,
      debugMaxSamples: debugMaxSamples,
      bufferFrameCount: bufferFrameCount,
      renderQuantum: renderQuantum,
    };

    // Buffering state
    this.bufferSize = bufferSize;
    this.nearEndBuffer = new Float32Array(bufferSize);
    this.farEndBuffer = new Float32Array(bufferSize);
    this.outputBuffer = new Float32Array(bufferSize);
    this.testSignalBuffer = new Float32Array(bufferSize);
    this.bufferWritePos = 0;
    this.bufferReadPos = 0;
    this.bufferedFrames = 0;

    // Debug tracks recorded by the processor
    this.debugTracks = null;
    this.debugWritePos = 0;

    this.strategies = {
      passthrough: new PassthroughStrategy(this.fauxecState),
      silenceMic: new SilenceMicStrategy(this.fauxecState),
      testTone: new TestToneStrategy(this.fauxecState),
      naiveSubtract: new NaiveSubtractStrategy(this.fauxecState),
      halfDuplex: new HalfDuplexStrategy(this.fauxecState),
      timeAlignedSubtract: new TimeAlignedSubtractStrategy(this.fauxecState),
      rir: new RIRStrategy(this.fauxecState),
      lms: new NLMSStrategy(this.fauxecState),
    };

    this.port.onmessage = (event) => {
      const { type, value } = event.data;
      if (type === 'setMode') {
        if (!this.strategies[value]) {
          console.error(`${value} isn't a supported FauxEC strategy`);
        } else {
          if (this.mode !== value) {
            this.mode = value;
            this.strategies[value].onSelected();
          }
        }
      } else if (type === 'setBufferFrameCount') {
        const newCount = Math.max(1, Math.floor(value));
        this.fauxecState.bufferFrameCount = newCount;
        this.bufferSize = newCount * this.fauxecState.renderQuantum;
        this.nearEndBuffer = new Float32Array(this.bufferSize);
        this.farEndBuffer = new Float32Array(this.bufferSize);
        this.outputBuffer = new Float32Array(this.bufferSize);
        this.testSignalBuffer = new Float32Array(this.bufferSize);
        this.bufferWritePos = 0;
        this.bufferReadPos = 0;
        this.bufferedFrames = 0;
      } else if (type === 'getStats') {
        this.pubStats();
      } else if (type === 'getDefaultConfigs') {
        this.port.postMessage({ type: 'xCorrDefaults', value: XCorrHelper.getDefaultCfg() });
        this.port.postMessage({ type: 'halfDuplexDefaults', value: HalfDuplexStrategy.getDefaultCfg() });
        this.port.postMessage({ type: 'rirDefaults', value: RIRStrategy.getDefaultCfg() });
        this.port.postMessage({ type: 'nlmsDefaults', value: NLMSStrategy.getDefaultCfg() });
      } else if (type === 'startDebugRecording') {
        this.startDebugRecording();
      } else if (type === 'stopDebugRecording') {
        this.stopDebugRecording();
      } else {
        for (const strategy of Object.values(this.strategies)) {
          strategy.onMessage(type, value);
        }
      }
    };
  }

  pubStats() {
    let medianProcessingMs = 0;
    let p95ProcessingMs = 0;
    if (this.processingTimeHistory.length > 0) {
      const sorted = [...this.processingTimeHistory].sort((a, b) => a - b);
      medianProcessingMs = sorted[Math.floor(sorted.length / 2)];
      p95ProcessingMs = sorted[Math.floor(sorted.length * 0.95)];
    }
    const activeStrategy = this.strategies[this.mode];
    this.port.postMessage({
      type: 'stats',
      value: {
        m: this.mode,
        ...this.fauxecState.stats,
        bufferFrames: this.fauxecState.bufferFrameCount,
        bufferSamples: this.bufferSize,
        tProc: medianProcessingMs,
        tProcP95: p95ProcessingMs,
        ...activeStrategy.getStats(),
      },
    });
  }

  startDebugRecording() {
    const maxSamples = this.fauxecState.debugMaxSamples;
    this.debugTracks = {
      nearEnd: new Float32Array(maxSamples),
      farEnd: new Float32Array(maxSamples),
      output: new Float32Array(maxSamples),
    };
    this.debugWritePos = 0;
    this.fauxecState.debugRecording = true;
    // Tell active strategy to start recording too
    const strategy = this.strategies[this.mode];
    if (strategy.startDebugRecording) {
      strategy.startDebugRecording();
    }
  }

  stopDebugRecording() {
    this.fauxecState.debugRecording = false;
    // Get strategy-specific tracks
    const strategy = this.strategies[this.mode];
    const strategyTracks = strategy.getDebugTracks ? strategy.getDebugTracks() : [];

    const tracks = [];
    if (this.debugTracks) {
      tracks.push(['nearEnd.wav', this.debugTracks.nearEnd.slice(0, this.debugWritePos)]);
      tracks.push(['farEnd.wav', this.debugTracks.farEnd.slice(0, this.debugWritePos)]);
      tracks.push(['output.wav', this.debugTracks.output.slice(0, this.debugWritePos)]);
    }
    tracks.push(...strategyTracks);

    this.debugTracks = null;
    this.debugWritePos = 0;
    this.port.postMessage({ type: 'debugTracks', value: { tracks, sampleRate } });
  }

  process(inputs, outputs, parameters) {
    const nearEnd = inputs[0];
    const farEnd = inputs[1];
    const output = outputs[0];
    const testSignalOutput = outputs[1];

    const startTime = Date.now();

    this.fauxecState.stats.frames++;

    const nSamples = output[0].length;
    const nearEndFrame = nearEnd?.[0] ?? new Float32Array(nSamples);
    const farEndFrame = farEnd?.[0] ?? new Float32Array(nSamples);

    // Accumulate input samples into buffer
    for (let i = 0; i < nSamples; i++) {
      this.nearEndBuffer[this.bufferWritePos + i] = nearEndFrame[i];
      this.farEndBuffer[this.bufferWritePos + i] = farEndFrame[i];
    }
    this.bufferWritePos += nSamples;
    this.bufferedFrames++;

    // When buffer is full, process all buffered samples
    if (this.bufferedFrames >= this.fauxecState.bufferFrameCount) {
      const strategy = this.strategies[this.mode];
      const totalSamples = this.bufferSize;

      // Clear test signal buffer
      for (let i = 0; i < totalSamples; i++) {
        this.testSignalBuffer[i] = 0;
      }

      // Process all buffered samples at once
      strategy.onFrame(
        totalSamples,
        this.nearEndBuffer,
        this.farEndBuffer,
        this.outputBuffer,
        this.testSignalBuffer
      );

      // Record debug tracks if active
      if (this.fauxecState.debugRecording && this.debugTracks) {
        const maxSamples = this.fauxecState.debugMaxSamples;
        for (let i = 0; i < totalSamples && this.debugWritePos < maxSamples; i++) {
          this.debugTracks.nearEnd[this.debugWritePos] = this.nearEndBuffer[i];
          this.debugTracks.farEnd[this.debugWritePos] = this.farEndBuffer[i];
          this.debugTracks.output[this.debugWritePos] = this.outputBuffer[i];
          this.debugWritePos++;
        }
      }

      // Reset write position for next batch
      this.bufferWritePos = 0;
      this.bufferReadPos = 0;
      this.bufferedFrames = 0;
    }

    // Output from processed buffer (or silence if still buffering)
    const readStart = this.bufferReadPos;
    for (let i = 0; i < nSamples; i++) {
      output[0][i] = this.outputBuffer[readStart + i];
    }
    this.bufferReadPos += nSamples;

    // Copy mono output to all channels (for output 0)
    for (let ch = 1; ch < output.length; ch++) {
      for (let i = 0; i < output[ch].length; i++) {
        output[ch][i] = output[0][i];
      }
    }

    // Copy test signal to all channels (for output 1)
    if (testSignalOutput) {
      for (let i = 0; i < nSamples; i++) {
        testSignalOutput[0][i] = this.testSignalBuffer[readStart + i];
      }
      for (let ch = 1; ch < testSignalOutput.length; ch++) {
        for (let i = 0; i < testSignalOutput[ch].length; i++) {
          testSignalOutput[ch][i] = testSignalOutput[0][i];
        }
      }
    }

    // Measure processing time and check for xruns. Max res is 1ms, so simplest processing should be 0.
    const processingMs = Date.now() - startTime;
    const timesliceMs = (nSamples / sampleRate) * 1000;
    if (processingMs > timesliceMs * 0.8) {
      this.fauxecState.stats.xruns++;
    }

    // Track history for percentiles (keep last 1000 samples)
    this.processingTimeHistory.push(processingMs);
    if (this.processingTimeHistory.length > 1000) {
      this.processingTimeHistory.shift();
    }

    return true;
  }
}

registerProcessor('noisy-faux-ec', NoisyFauxECProcessor);
