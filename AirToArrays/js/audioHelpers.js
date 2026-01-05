/**
 * Audio helpers for Web Audio API.
 */

/**
 * Get user microphone with optimal settings for audio analysis.
 * @returns {Promise<MediaStream>} Media stream from microphone
 */
export function getUserMic() {
  return navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {autoGainControl: false, echoCancellation: false, noiseSuppression: false},
  });
}

/**
 * Create an oscillator manager for playing tones with start/stop control.
 *
 * @param {AudioContext} audioCtx - The Web Audio API context
 * @param {HTMLElement} startStopBtn - Button element to toggle (updates textContent)
 * @param {function} getFrequency - Function that returns current frequency in Hz
 * @param {function} getAmplitude - Function that returns current amplitude (0-1)
 * @returns {Object} Manager with start, stop, toggle, setFrequency, setAmplitude methods
 *
 * @example
 * const osc = createOscillatorManager(
 *   audioContext,
 *   document.getElementById('myButton'),
 *   () => parseFloat(freqSlider.value),
 *   () => parseFloat(ampSlider.value)
 * );
 *
 * // Toggle on button click
 * button.addEventListener('click', osc.toggle);
 *
 * // Update frequency in real-time
 * freqSlider.addEventListener('input', () => osc.setFrequency(parseFloat(freqSlider.value)));
 *
 * // Clean up
 * osc.stop();
 */
export function createOscillatorManager(audioCtx, startStopBtnId, getFrequency, getAmplitude) {
  const startStopBtn = startStopBtnId? document.getElementById(startStopBtnId) : null;
  let oscillator = null;
  let gainNode = null;
  let oscType = 'sine';

  /**
   * Start the oscillator with current frequency and amplitude.
   */
  const start = () => {
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    oscillator.frequency.value = getFrequency();
    oscillator.type = oscType;
    gainNode.gain.value = getAmplitude();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();

    if (startStopBtn) startStopBtn.textContent = 'Stop';
  };

  /**
   * Stop the oscillator and disconnect nodes.
   */
  const stop = () => {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    if (startStopBtn) startStopBtn.textContent = 'Start';
  };

  /**
   * Toggle between start and stop states.
   */
  const toggle = () => {
    if (oscillator) {
      stop();
    } else {
      start();
    }
  };

  /**
   * Update oscillator frequency in real-time.
   * @param {number} freq - New frequency in Hz
   */
  const setFrequency = (freq) => {
    if (oscillator) {
      oscillator.frequency.value = freq;
    }
  };

  /**
   * Update gain (amplitude) in real-time.
   * @param {number} amp - New amplitude (0-1)
   */
  const setAmplitude = (amp) => {
    if (gainNode) {
      gainNode.gain.value = amp;
    }
  };

  const setType = (t) => {
    oscType = t;
    if (oscillator) {
      oscillator.type = t;
    }
  };

  if (startStopBtn) startStopBtn.addEventListener('click', toggle);

  const destroy =() => {
    if (startStopBtn) startStopBtn.removeEventListener('click', toggle);
    stop();
  }

  return {
    start,
    stop,
    toggle,
    setFrequency,
    setAmplitude,
    setType,
    isRunning: () => !!oscillator,
    getOsc: () => oscillator,
    destroy,
  };
}

/**
 * Create a dual oscillator manager for playing two tones with start/stop control.
 *
 * @param {AudioContext} audioCtx - The Web Audio API context
 * @param {HTMLElement} startStopBtn - Button element to toggle (updates textContent)
 * @param {function} getFreq1 - Function that returns frequency 1 (linear 0-1 if freqRange set, else Hz)
 * @param {function} getFreq2 - Function that returns frequency 2 (ignored if phaseEnabled)
 * @param {Object} options - Configuration options
 * @param {number} options.amplitude - Gain value (default 0.1)
 * @param {boolean} options.sharedGain - Use single shared gain node (default true)
 * @param {boolean} options.phaseEnabled - Add DelayNode on osc2 for phase control (default false)
 * @param {function} options.getPhase - Function returning phase in radians (required if phaseEnabled)
 * @param {number[]} options.freqRange - [min, max] Hz range; if set, getFreq1/2 return 0-1 linear values
 * @returns {Object} Manager with start, stop, toggle, setFreq1, setFreq2, setPhase, getOutputNode methods
 *
 * @example
 * // With freqRange - getters return raw slider values (0-1), manager converts to log Hz
 * const dual = createDualOscillatorManager(ctx, btn,
 *   () => parseFloat(freq1Slider.value),
 *   () => parseFloat(freq2Slider.value),
 *   { freqRange: [50, 1000] }
 * );
 * freq1Slider.addEventListener('input', () => dual.setFreq1(parseFloat(freq1Slider.value)));
 *
 * // Without freqRange - getters return Hz directly (backwards compatible)
 * const dual = createDualOscillatorManager(ctx, btn, () => 440, () => 880, {});
 */
export function createDualOscillatorManager(audioCtx, startStopBtn, getFreq1, getFreq2, options = {}) {
  const { amplitude = 0.1, sharedGain = true, phaseEnabled = false, getPhase = () => 0, freqRange = null } = options;

  // If freqRange is set, create a log converter and wrap the getters
  let toHz = (linVal) => linVal;  // identity by default
  if (freqRange) {
    const [min, max] = freqRange;
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    const logRange = logMax - logMin;
    toHz = (linVal) => {
      if (linVal <= 0) return min;
      if (linVal >= 1) return max;
      return Math.exp(logMin + linVal * logRange);
    };
  }

  const getFreq1Hz = () => toHz(getFreq1());
  const getFreq2Hz = () => toHz(getFreq2());

  let osc1 = null;
  let osc2 = null;
  let gain1 = null;
  let gain2 = null;
  let delayNode = null;
  let outputNode = null;

  // Calculate delay time from phase: delay = phase / (2π * freq)
  const calcDelayTime = (freq, phaseRad) => {
    if (freq <= 0) return 0;
    return phaseRad / (2 * Math.PI * freq);
  };

  const start = () => {
    osc1 = audioCtx.createOscillator();
    osc2 = audioCtx.createOscillator();
    gain1 = audioCtx.createGain();

    const freq1 = getFreq1Hz();
    const freq2 = phaseEnabled ? freq1 : getFreq2Hz();

    osc1.frequency.value = freq1;
    osc2.frequency.value = freq2;
    gain1.gain.value = amplitude;

    if (phaseEnabled) {
      // osc1 → gain1 → destination
      // osc2 → delay → gain2 → destination
      gain2 = audioCtx.createGain();
      gain2.gain.value = amplitude;
      delayNode = audioCtx.createDelay(0.1);  // Max 100ms for low freq + full phase
      delayNode.delayTime.value = calcDelayTime(freq1, getPhase());

      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc2.connect(delayNode);
      delayNode.connect(gain2);
      gain2.connect(audioCtx.destination);
      outputNode = gain1;
    } else if (sharedGain) {
      // Both oscillators → shared gain → destination
      osc1.connect(gain1);
      osc2.connect(gain1);
      gain1.connect(audioCtx.destination);
      outputNode = gain1;
    } else {
      // Each oscillator → own gain → destination
      gain2 = audioCtx.createGain();
      gain2.gain.value = amplitude;
      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(audioCtx.destination);
      gain2.connect(audioCtx.destination);
      outputNode = gain1;
    }

    osc1.start();
    osc2.start();
    startStopBtn.textContent = 'Stop';
  };

  const stop = () => {
    if (osc1) { osc1.stop(); osc1.disconnect(); osc1 = null; }
    if (osc2) { osc2.stop(); osc2.disconnect(); osc2 = null; }
    if (gain1) { gain1.disconnect(); gain1 = null; }
    if (gain2) { gain2.disconnect(); gain2 = null; }
    if (delayNode) { delayNode.disconnect(); delayNode = null; }
    outputNode = null;
    startStopBtn.textContent = 'Start';
  };

  const toggle = () => {
    if (osc1) { stop(); } else { start(); }
  };

  const setFreq1 = (linVal) => {
    const freq = toHz(linVal);
    if (osc1) osc1.frequency.value = freq;
    if (phaseEnabled && osc2) osc2.frequency.value = freq;
    if (delayNode) delayNode.delayTime.value = calcDelayTime(freq, getPhase());
  };

  const setFreq2 = (linVal) => {
    const freq = toHz(linVal);
    if (!phaseEnabled && osc2) osc2.frequency.value = freq;
  };

  const setPhase = () => {
    if (delayNode) {
      delayNode.delayTime.value = calcDelayTime(getFreq1Hz(), getPhase());
    }
  };

  const getOutputNode = () => outputNode;

  const isRunning = () => !!outputNode;

  return { start, stop, toggle, setFreq1, setFreq2, setPhase, getOutputNode, isRunning, getFreq1Hz, getFreq2Hz };
}

/**
 * Create converters between linear and logarithmic scales.
 * Useful for frequency/amplitude sliders where human perception is logarithmic.
 *
 * @param {number} min - Minimum value (must be > 0 for log scale)
 * @param {number} max - Maximum value
 * @returns {Object} Object with linToLog and logToLin conversion functions
 *
 * @example
 * const freqConv = createLogLinConverter(50, 10000);
 *
 * // Linear slider position (0-1) to actual frequency
 * const freq = freqConv.linToLog(0.5);  // ~707 Hz (geometric mean)
 *
 * // Frequency to linear slider position
 * const pos = freqConv.logToLin(1000);  // ~0.565
 */
export function createLogLinConverter(min, max) {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const logRange = logMax - logMin;

  /**
   * Convert linear position (0-1) to logarithmic value.
   * @param {number} linPos - Linear position from 0 to 1
   * @returns {number} Value on logarithmic scale between min and max
   */
  const linToLog = (linPos) => {
    if (linPos <= 0) return min;
    if (linPos >= 1) return max;
    return Math.exp(logMin + linPos * logRange);
  };

  /**
   * Convert logarithmic value to linear position (0-1).
   * @param {number} logVal - Value between min and max
   * @returns {number} Linear position from 0 to 1
   */
  const logToLin = (logVal) => {
    if (logVal <= min) return 0;
    if (logVal >= max) return 1;
    return (Math.log(logVal) - logMin) / logRange;
  };

  return { linToLog, logToLin, min, max };
}

/**
 * Convert a linear amplitude value to dBFS (decibels relative to full scale).
 *
 * @param {number} amplitude - Linear amplitude value (0-1)
 * @returns {string} dBFS value as string, or '-∞' for zero/negative
 *
 * @example
 * toDbfs(1.0)   // "0"
 * toDbfs(0.5)   // "-6"
 * toDbfs(0.25)  // "-12"
 * toDbfs(0.1)   // "-20"
 * toDbfs(0)     // "-∞"
 */
export function toDbfs(amplitude) {
  if (amplitude <= 0) return '-∞';
  return (20 * Math.log10(amplitude)).toFixed(0);
}

/**
 * Format a frequency value for display, using 'k' suffix for thousands.
 *
 * @param {number} freq - Frequency in Hz
 * @returns {string} Formatted frequency string
 *
 * @example
 * formatFreq(440)   // "440"
 * formatFreq(1000)  // "1.0k"
 * formatFreq(2500)  // "2.5k"
 * formatFreq(10000) // "10.0k"
 */
export function formatFreq(freq) {
  if (freq >= 1000) {
    return `${(freq / 1000).toFixed(1)}k`;
  }
  return freq.toFixed(0);
}

/**
 * Build an FFT like element. Docs @ https://audiomotion.dev/#/?id=live-code-examples
 */
import AudioMotionAnalyzer from './audiomotion-analyzer.js'
export function makeAudioMotionAnalyzer(ctx, divId, cfg) {
  return new AudioMotionAnalyzer(
    document.getElementById(divId),
    {
      audioCtx: ctx,
      connectSpeakers: false,
      mode: 1,
      fftSize: 16384,
      maxFreq: 10000,
      minFreq: 50,
      height: window.innerHeight * 0.9,
      width: window.innerWidth * 0.9,
      barSpace: 0.6,
      weightingFilter: "D",
      peakLine: true,
      frequencyScale: "mel",
      showScaleX: true,
      showScaleY: true,
      ...cfg
    }
  );
}

/**
 * Creates a signal reconstructor that analyzes an input signal via FFT
 * and reconstructs it using a configurable number of sine oscillators.
 *
 * @param {AudioContext} ctx - The audio context
 * @param {Object} options - Configuration options
 * @param {number} options.fftSize - FFT size (default 4096)
 * @returns {Object} Reconstructor interface
 */
export function createSignalReconstructor(ctx, options = {}) {
  const {
    fftSize = 2048,
  } = options;

  // --- Input side: analyser for FFT ---
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;
  analyser.minDecibels = -60;
  analyser.maxDecibels = 0;

  const frequencyData = new Float32Array(analyser.frequencyBinCount);
  const freqResolution = ctx.sampleRate / fftSize;

  // --- Output side: oscillators ---
  const masterGain = ctx.createGain();
  masterGain.gain.value = 1;

  let outputOscillators = [];
  let outputGains = [];
  let isBypassed = false;

  // --- State ---
  let cachedTerms = [];
  let numTerms = 1;

  /**
   * Extract frequency terms from the analyser's FFT data.
   */
  const extractFrequencyTerms = () => {
    analyser.getFloatFrequencyData(frequencyData);

    // Ignore harmonics below the noise floor. This should give us more oscillators for the bands
    // with energy, but will sound less accurate for signals with a lot of harmonics.
    const minDb = -90;

    const results = [];
    for (let k = 1; k < frequencyData.length; k++) {
      const dB = frequencyData[k];

      if (dB > minDb) {
        const magnitude = 2 * Math.pow(10, dB / 20);
        const freq = k * freqResolution;
        results.push({ freq, magnitude, bin: k });
      }
    }

    results.sort((a, b) => b.magnitude - a.magnitude);
    return results;
  };

  /**
   * Create oscillators from the current terms.
   */
  const createOscillators = () => {
    const terms = cachedTerms.slice(0, numTerms);

    for (const term of terms) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = term.freq;
      gain.gain.value = term.magnitude;

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      outputOscillators.push(osc);
      outputGains.push(gain);
    }
  };

  /**
   * Stop and disconnect all output oscillators.
   */
  const stopOscillators = () => {
    for (const osc of outputOscillators) {
      try { osc.stop(); osc.disconnect(); } catch (e) {}
    }
    for (const g of outputGains) {
      try { g.disconnect(); } catch (e) {}
    }
    outputOscillators = [];
    outputGains = [];
  };


  /**
   * Update bypass routing.
   * When bypassed, input passes directly to output.
   * When not bypassed, oscillators feed the output.
   */
  const setBypass = (bypass) => {
    if (bypass == isBypassed) return;
    isBypassed = bypass;
    if (isBypassed) {
      analyser.connect(masterGain);
      stopOscillators();
    } else {
      try { analyser.disconnect(masterGain); } catch (e) {}
      createOscillators();
    }
  };

  return {
    /** Connect your input signal to this node */
    getInputNode: () => analyser,

    /** The reconstructed output signal */
    getOutputNode: () => masterGain,

    /** Analyze the input and cache frequency terms. Will exec after a timeout, to give the buffer a chance
     * to fill up before running the analysis. Will invoke cb once the analysis is done. */
    analyzeAndStart: (cb) => {
      setTimeout(() => {
        cachedTerms = extractFrequencyTerms();
        stopOscillators();
        createOscillators();
        cb();
      }, 100);
    },

    /** Get the cached frequency terms (up to numTerms) */
    getTerms: () => cachedTerms.slice(0, numTerms),

    /** Set the number of terms to use for reconstruction */
    setNumTerms: (n) => {
      numTerms = n;
      stopOscillators();
      createOscillators();
    },

    /** Start the output oscillators */
    start: () => {
      for (const osc of outputOscillators) {
        try { osc.start(); } catch (e) {}
      }
    },

    stop: stopOscillators,
    setBypass,
  };
}

/* Records user mic for a period of time, returns recorded buffer */
export function createMicRecorder(recordBtnId, ctx, timeoutMs=1000) {
  const recordBtn = document.getElementById(recordBtnId);
  let isRecording = false;
  let recordedBuffer = null;

  const record = async () => {
    if (isRecording) return;
    isRecording = true;
    recordBtn.textContent = 'Recording...';
    recordBtn.disabled = true;

    const stream = await getUserMic();
    const chunks = [];

    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      recordedBuffer = await ctx.decodeAudioData(arrayBuffer);

      isRecording = false;
      recordBtn.textContent = 'Record';
      recordBtn.disabled = false;
    };

    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), timeoutMs);
  }

  recordBtn.addEventListener('click', record);
  return {
    record,
    getRecordedBuffer: () => recordedBuffer,
    destroy: () => {
      recordBtn.removeEventListener('click', record);
    },
  };
}

