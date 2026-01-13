import * as canvas from './canvas.js'
import * as noisy from './noisy.js'

const m$ = (x) => document.getElementById(x);

export async function stopCopyingMe(ctx) {
  let mic = null;
  const micGain = ctx.createGain();
  const attnNode = ctx.createGain();
  const delayNode = ctx.createDelay(/*maxDelaySecs=*/5);
  const inputTD = canvas.mkEnvelopePlot('stopCopyingMe_inputTd', ctx);
  const outputTD = canvas.mkEnvelopePlot('stopCopyingMe_outputTd', ctx);

  // Add a bit of extra gain to the input mic, to make it easier to hear
  micGain.gain.value = 1+noisy.fromDb(3);

  micGain.connect(attnNode);
  attnNode.connect(delayNode);
  delayNode.connect(ctx.destination);
  inputTD.connectInput(micGain);
  outputTD.connectInput(delayNode);

  const updateParams = () => {
    const delay = parseFloat(m$('stopCopyingMe_delay').value);
    const attn = parseFloat(m$('stopCopyingMe_attn').value);
    const attnLin = 1 / noisy.fromDb(attn);
    m$('stopCopyingMe_attnValue').textContent = `(${attn}dB; ${attnLin.toFixed(2)}lin)`;
    m$('stopCopyingMe_delayValue').textContent = `${delay}ms`;
    attnNode.gain.setValueAtTime(attnLin, ctx.currentTime);
    delayNode.delayTime.setValueAtTime(delay / 1000, ctx.currentTime);
  };

  m$('stopCopyingMe_delay').addEventListener('input', updateParams);
  m$('stopCopyingMe_attn').addEventListener('input', updateParams);
  updateParams();

  return {
    start: async () => {
      mic = ctx.createMediaStreamSource(await noisy.getUserMic());
      mic.connect(micGain);
      updateParams();
    },
    stop: async () => {
      mic.disconnect();
      mic = null;
    },
    cleanup: async () => {
      inputTD.stop();
      outputTD.stop();
      mic && mic.disconnect();
      mic = null;
      m$('stopCopyingMe_delay').removeEventListener('input', updateParams);
      m$('stopCopyingMe_attn').removeEventListener('input', updateParams);
    },
  };
}

/**
 * AECEvaluator - Evaluates echo cancellation performance from recorded tracks.
 *
 * TEST PROCEDURE:
 * ===============
 * Run three separate recordings, one for each test type:
 *
 * 1. FAR-END ONLY (ERLE test) - ~10 seconds
 *    - Play audio through speakers (far-end active)
 *    - Stay silent (no near-end speech)
 *    - Measures: ERLE, residual echo RMS, echo estimate correlation
 *    - Good ERLE: > 10 dB, Excellent: > 20 dB
 *
 * 2. NEAR-END ONLY (Preservation test) - ~10 seconds
 *    - Mute all far-end audio sources
 *    - Speak into the microphone
 *    - Measures: Near-end distortion (output should equal nearEnd)
 *    - Good preservation: distortion < -30 dB
 *
 * 3. DOUBLE-TALK (Optional, subjective) - ~10 seconds
 *    - Play audio through speakers AND speak simultaneously
 *    - Measures: Approximate ERLE during double-talk (less reliable)
 *    - Requires manual listening evaluation for quality
 *
 * REQUIRED TRACKS:
 * - nearEnd.wav: Raw microphone input (contains echo + near-end speech)
 * - farEnd.wav: Signal sent to speakers
 * - output.wav: Echo-cancelled output
 * - echo_estimate.wav: Estimated echo (optional, for correlation metric)
 */
class AECEvaluator {
  constructor() {
    this.tracks = null;
    this.sampleRate = 48000;
    this.frameSize = 2400; // 50ms frames at 48kHz
  }

  setLastTest(tracks, sampleRate) {
    this.sampleRate = sampleRate;
    this.frameSize = Math.floor(sampleRate * 0.05); // 50ms frames
    this.tracks = {};
    for (const [filename, samples] of tracks) {
      const key = filename.replace('.wav', '');
      this.tracks[key] = samples;
    }
    console.log('AECEvaluator: Loaded tracks:', Object.keys(this.tracks));
  }

  runEval = () => {
    if (!this.tracks || !this.tracks.nearEnd || !this.tracks.output) {
      console.error('AECEvaluator: Missing required tracks (nearEnd, output)');
      return;
    }

    const results = {
      erle: this._computeERLE(),
      preservation: this._computePreservation(),
      correlation: this._computeCorrelation(),
    };

    console.log('=== AEC Evaluation Results ===');
    console.log(`ERLE (far-end only frames): ${results.erle.meanDb.toFixed(1)} dB`);
    console.log(`  - Frames analyzed: ${results.erle.frameCount}`);
    console.log(`  - Residual RMS: ${results.erle.residualRms.toFixed(4)}`);
    console.log(`Preservation (near-end only frames): ${results.preservation.distortionDb.toFixed(1)} dB`);
    console.log(`  - Frames analyzed: ${results.preservation.frameCount}`);
    if (results.correlation !== null) {
      console.log(`Echo estimate correlation: ${results.correlation.toFixed(3)}`);
    }
    console.log('==============================');

    return results;
  }

  _rms(arr, start, len) {
    let sum = 0;
    for (let i = start; i < start + len && i < arr.length; i++) {
      sum += arr[i] * arr[i];
    }
    return Math.sqrt(sum / len);
  }

  _computeERLE() {
    // ERLE = 10 * log10(power(nearEnd) / power(output))
    // Only valid for far-end-only frames (farEnd active, nearEnd mostly echo)
    const { nearEnd, farEnd, output } = this.tracks;
    const frameSize = this.frameSize;
    const numFrames = Math.floor(Math.min(nearEnd.length, output.length, farEnd?.length || Infinity) / frameSize);

    const farEndThreshold = 0.01;  // Far-end must be active
    const erleValues = [];
    let residualSum = 0;
    let residualCount = 0;

    for (let f = 0; f < numFrames; f++) {
      const start = f * frameSize;
      const farEndRms = farEnd ? this._rms(farEnd, start, frameSize) : 1;
      const nearEndRms = this._rms(nearEnd, start, frameSize);
      const outputRms = this._rms(output, start, frameSize);

      // Only analyze frames where far-end is active
      if (farEndRms > farEndThreshold && nearEndRms > 0.001 && outputRms > 0.0001) {
        const erle = 10 * Math.log10(nearEndRms * nearEndRms / (outputRms * outputRms));
        erleValues.push(erle);
        residualSum += outputRms;
        residualCount++;
      }
    }

    const meanErle = erleValues.length > 0
      ? erleValues.reduce((a, b) => a + b, 0) / erleValues.length
      : 0;

    return {
      meanDb: meanErle,
      frameCount: erleValues.length,
      residualRms: residualCount > 0 ? residualSum / residualCount : 0,
    };
  }

  _computePreservation() {
    // Measures distortion when near-end only (far-end silent)
    // Output should equal nearEnd; any difference is distortion
    const { nearEnd, farEnd, output } = this.tracks;
    const frameSize = this.frameSize;
    const numFrames = Math.floor(Math.min(nearEnd.length, output.length) / frameSize);

    const farEndThreshold = 0.005;  // Far-end should be silent
    const nearEndThreshold = 0.01;  // Near-end should be active
    let distortionPower = 0;
    let signalPower = 0;
    let frameCount = 0;

    for (let f = 0; f < numFrames; f++) {
      const start = f * frameSize;
      const farEndRms = farEnd ? this._rms(farEnd, start, frameSize) : 0;
      const nearEndRms = this._rms(nearEnd, start, frameSize);

      // Only analyze frames where far-end is silent and near-end is active
      if (farEndRms < farEndThreshold && nearEndRms > nearEndThreshold) {
        for (let i = start; i < start + frameSize && i < nearEnd.length; i++) {
          const diff = output[i] - nearEnd[i];
          distortionPower += diff * diff;
          signalPower += nearEnd[i] * nearEnd[i];
        }
        frameCount++;
      }
    }

    const distortionDb = signalPower > 0
      ? 10 * Math.log10(distortionPower / signalPower)
      : -Infinity;

    return {
      distortionDb,
      frameCount,
    };
  }

  _computeCorrelation() {
    // Correlation between echo estimate and nearEnd (during far-end active)
    const { nearEnd, farEnd, echo_estimate } = this.tracks;
    if (!echo_estimate) return null;

    const len = Math.min(nearEnd.length, echo_estimate.length);
    let sumXY = 0, sumX2 = 0, sumY2 = 0;
    let count = 0;

    // Only correlate during far-end active periods
    const frameSize = this.frameSize;
    for (let i = 0; i < len; i++) {
      const frameStart = Math.floor(i / frameSize) * frameSize;
      const farEndRms = farEnd ? this._rms(farEnd, frameStart, frameSize) : 1;

      if (farEndRms > 0.01) {
        sumXY += nearEnd[i] * echo_estimate[i];
        sumX2 += nearEnd[i] * nearEnd[i];
        sumY2 += echo_estimate[i] * echo_estimate[i];
        count++;
      }
    }

    const denom = Math.sqrt(sumX2 * sumY2);
    return denom > 0 ? sumXY / denom : 0;
  }
}

// Worklets that need to be loaded before slide demos run
export const workletsToLoad = [
  'js/noisy-processors/noisyFauxEC.js',
];

async function mkFauxECDemo(ctx, prefix, opts = {}) {
  // opts.strategies: array of strategy names to enable (e.g., ['halfDuplex', 'rir', 'nlms'])
  // If not provided, all strategies are enabled
  const enabledStrategies = opts.strategies || ['halfDuplex', 'timeAligned', 'rir', 'nlms'];
  const hasStrategy = (name) => enabledStrategies.includes(name);
  // Helper to get element by prefixed id
  const p$ = (name) => document.getElementById(`${prefix}_${name}`);
  // Helper to get value from optional config control
  const pv = (name, defaultVal = 0) => {
    const el = p$(name);
    return el ? (typeof defaultVal === 'string' ? el.value : Number(el.value)) : defaultVal;
  };

  const masterBus = ctx.createGain();
  masterBus.connect(ctx.destination);
  const renderTD = canvas.mkEnvelopePlot(`${prefix}_renderTd`, ctx);
  renderTD.connectInput(masterBus);

  const perfEval = new AECEvaluator();

  // Graph 1: connect audio sources to render (far end)
  const farEndGain = ctx.createGain();
  farEndGain.gain.setValueAtTime(1, ctx.currentTime);
  farEndGain.connect(masterBus);
  ctx.createMediaElementSource(p$('music')).connect(farEndGain);
  ctx.createMediaElementSource(p$('speech1')).connect(farEndGain);
  ctx.createMediaElementSource(p$('speech2')).connect(farEndGain);
  ctx.createMediaElementSource(p$('speech3')).connect(farEndGain);

  // Graph 2: connect mic input, to capture near end and play it back later
  let mic = null;
  const micGain = ctx.createGain();
  const recorder = noisy.mkRecorder(ctx);
  const micTD = canvas.mkEnvelopePlot(`${prefix}_micTd`, ctx);

  const fauxECNode = new AudioWorkletNode(ctx, 'noisy-faux-ec', {
    numberOfInputs: 2,
    numberOfOutputs: 2,
  });

  farEndGain.connect(fauxECNode, 0, 1);  // far-end = input 1
  fauxECNode.connect(micGain);           // out port 0 -> raw near end
  fauxECNode.connect(masterBus, 1);      // out port 1 -> speaker, used if the EC needs to override output
  recorder.connectInput(micGain);
  micTD.connectInput(micGain);
  // Loop back recorder output to speaker, so user can hear recording
  recorder.getOutput().connect(masterBus);

  // Config control definitions [suffix, configKey] - value display element is always ${suffix}_val
  const halfduplexCtrls = [
    ['attackMs', 'attackMs'],
    ['decayMs', 'decayMs'],
    ['thresholdDb', 'thresholdDb'],
  ];
  const timealignerCtrls = [
    ['taMinDelayMs', 'minDelayMs'],
    ['taUpdateIntervalFrames', 'updateIntervalFrames'],
    ['taEchoTimeWindowSizeMs', 'echoTimeWindowSizeMs'],
    ['taStepSize', 'stepSize'],
    ['taTxThresholdDb', 'txThresholdDb'],
    ['taRxThresholdDb', 'rxThresholdDb'],
    ['taSmoothingAlpha', 'smoothingAlpha'],
    ['taNccThreshold', 'nxcThreshold'],
    ['taXcorrWindowSize', 'xcorrWindowSize'],
    ['taEchoAttenuation', 'echoAttenuation'],
  ];
  const rirCtrls = [
    ['rirIrLength', 'irLength'],
    ['rirMeasurementDurationMs', 'measurementDurationMs'],
    ['rirTestSignalType', 'testSignalType'],
    ['rirDiracPulseWidth', 'diracPulseWidth'],
    ['rirMlsOrder', 'mlsOrder'],
    ['rirEchoAttenuation', 'echoAttenuation'],
  ];
  const lmsCtrls = [
    ['lmsFilterLength', 'filterLength'],
    ['lmsStepSize', 'stepSize'],
    ['lmsLeakage', 'leakage'],
    ['lmsMinDelayMs', 'minDelayMs'],
  ];

  const formatIrLength = (samples) => {
    const ms = Math.round(samples / ctx.sampleRate * 1000);
    return `${samples} samples/${ms}ms`;
  };

  const updateAECCfgs = () => {
    // Only send configs for enabled strategies
    // If exactly one strategy, use it as the mode; otherwise read from dropdown
    const mode = enabledStrategies.length === 1 ? enabledStrategies[0] : pv('mode', 'passthrough');
    const cfg = { mode };
    if (hasStrategy('timeAligned')) {
      cfg.timeAligned = {
        minDelayMs: pv('taMinDelayMs'),
        updateIntervalFrames: pv('taUpdateIntervalFrames'),
        echoTimeWindowSizeMs: pv('taEchoTimeWindowSizeMs'),
        stepSize: pv('taStepSize'),
        txThresholdDb: pv('taTxThresholdDb'),
        rxThresholdDb: pv('taRxThresholdDb'),
        smoothingAlpha: pv('taSmoothingAlpha'),
        nxcThreshold: pv('taNccThreshold'),
        xcorrWindowSize: pv('taXcorrWindowSize'),
        echoAttenuation: pv('taEchoAttenuation'),
      };
    }
    if (hasStrategy('halfDuplex')) {
      cfg.halfDuplex = {
        attackMs: pv('attackMs'),
        decayMs: pv('decayMs'),
        thresholdDb: pv('thresholdDb'),
      };
    }
    if (hasStrategy('rir')) {
      cfg.rir = {
        irLength: pv('rirIrLength'),
        measurementDurationMs: pv('rirMeasurementDurationMs'),
        testSignalType: pv('rirTestSignalType', ''),
        diracPulseWidth: pv('rirDiracPulseWidth'),
        mlsOrder: pv('rirMlsOrder'),
        echoAttenuation: pv('rirEchoAttenuation'),
      };
    }
    if (hasStrategy('nlms')) {
      cfg.nlms = {
        filterLength: pv('lmsFilterLength'),
        stepSize: pv('lmsStepSize'),
        leakage: pv('lmsLeakage'),
        minDelayMs: pv('lmsMinDelayMs'),
      };
    }
    fauxECNode.port.postMessage({ type: 'setConfigs', value: cfg });
  };

  // User interaction handlers (named for cleanup)
  const playEl = p$('play');
  const recEl = p$('rec');
  const onPlayClick = () => {
    recorder.playToggle(
      () => playEl.textContent = 'Stop',
      () => playEl.textContent = 'Play',
    );
  };
  const onRecClick = async () => {
    if (recorder.isRecording) {
      recorder.recordStop();
      mic && mic.disconnect();
      mic = null;
      recEl.textContent = 'Mic enable';
      playEl.disabled = false;
    } else {
      mic = ctx.createMediaStreamSource(await noisy.getUserMic());
      mic.connect(fauxECNode);
      recorder.record();
      recEl.textContent = 'Mic disable';
      playEl.disabled = true;
    }
  };
  const onLmsReset = () => fauxECNode.port.postMessage({ type: 'nlms_reset' });
  const onRirMeasure = () => fauxECNode.port.postMessage({ type: 'rir_measure' });

  // Track listeners for cleanup
  const listeners = [];
  const addListener = (el, event, handler) => {
    if (!el) return;
    el.addEventListener(event, handler);
    listeners.push({ el, event, handler });
  };

  addListener(playEl, 'click', onPlayClick);
  addListener(recEl, 'click', onRecClick);
  addListener(p$('lmsReset'), 'click', onLmsReset);
  addListener(p$('triggerRIRMeasure'), 'click', onRirMeasure);

  // Config hooks (for all controls that exist in DOM)
  const allCtrls = [['mode'], ...halfduplexCtrls, ...timealignerCtrls, ...rirCtrls, ...lmsCtrls];
  for (const [inputSuffix] of allCtrls) {
    const el = p$(inputSuffix);
    if (!el) continue;
    const eventType = (el.tagName === 'BUTTON' || el.type === 'button') ? 'click' : 'input';
    const handler = (e) => {
      const valEl = p$(`${inputSuffix}_val`);
      if (valEl) {
        const useIrFormat = inputSuffix === 'rirIrLength' || inputSuffix === 'lmsFilterLength';
        valEl.textContent = useIrFormat ? formatIrLength(e.target.value) : e.target.value;
      }
      updateAECCfgs();
    };
    addListener(el, eventType, handler);
  }

  // Request defaults from worklet and initialize UI
  const applyDefaults = (ctrls, defaults) => {
    for (const [inputSuffix, cfgKey] of ctrls) {
      const val = defaults[cfgKey];
      if (val === undefined) continue;
      const inputEl = p$(inputSuffix);
      if (inputEl) inputEl.value = val;
      const valEl = p$(`${inputSuffix}_val`);
      if (valEl) {
        const useIrFormat = inputSuffix === 'rirIrLength' || inputSuffix === 'lmsFilterLength';
        valEl.textContent = useIrFormat ? formatIrLength(val) : val;
      }
    }
  };

  const gatedEl = p$('gated');
  const statsEl = p$('stats');
  const debugRecEl = p$('debugRec');

  fauxECNode.port.postMessage({ type: 'getDefaultConfigs' });
  fauxECNode.port.onmessage = (e) => {
    if (e.data.type === 'gated') {
      if (gatedEl) gatedEl.style.color = e.data.value ? 'red' : 'green';
    } else if (e.data.type === 'stats') {
      if (statsEl) statsEl.textContent = JSON.stringify(e.data.value);
    } else if (e.data.type === 'defaultConfigs') {
      // Apply defaults to all elements that exist (applyDefaults skips missing elements)
      const { halfDuplex, xCorr, rir, nlms } = e.data.value;
      applyDefaults(halfduplexCtrls, halfDuplex);
      applyDefaults(timealignerCtrls, xCorr);
      applyDefaults(rirCtrls, rir);
      applyDefaults(lmsCtrls, nlms);
      updateAECCfgs();
    } else if (e.data.type === 'debugTracks') {
      const { tracks, sampleRate: sr } = e.data.value;
      if (!tracks) return;
      perfEval.setLastTest(tracks, sr);
      debugRecEl.disabled = false;
      for (const [filename, samples] of tracks) {
        noisy.floatToWavDownload(filename, samples, sr);
      }
      debugRecEl.textContent = 'Debug tracks';
    }
  };

  // Debug track recording
  let debugRecording = false;
  const onDebugRecClick = () => {
    if (debugRecording) {
      fauxECNode.port.postMessage({ type: 'stopDebugRecording' });
      debugRecording = false;
    } else {
      fauxECNode.port.postMessage({ type: 'startDebugRecording' });
      debugRecEl.textContent = 'Stop & Download';
      debugRecording = true;
    }
  };
  addListener(debugRecEl, 'click', onDebugRecClick);
  addListener(p$('evalPerf'), 'click', perfEval.runEval);

  const statsInterval = setInterval(() => {
    fauxECNode.port.postMessage({ type: 'getStats' });
  }, 500);

  return {
    cleanup: async () => {
      clearInterval(statsInterval);
      recorder.recordStop();
      mic && mic.disconnect();
      mic = null;
      fauxECNode.disconnect();

      // Remove all event listeners
      for (const { el, event, handler } of listeners) {
        el.removeEventListener(event, handler);
      }
    },
  };
}

export async function fauxecTutorial(ctx) {
  // fauxecTutorial only uses basic modes (passthrough, silenceMic, testTone)
  return mkFauxECDemo(ctx, 'fauxecTutorial', { strategies: [] });
}
export async function halfDuplex(ctx) {
  return mkFauxECDemo(ctx, 'halfDuplex', { strategies: ['halfDuplex'] });
}
export async function naiveDiff(ctx) {
  return mkFauxECDemo(ctx, 'naiveDiff', { strategies: ['naiveSubtract'] });
}
export async function timeAlignedDiff(ctx) {
  return mkFauxECDemo(ctx, 'timeAlignedDiff', { strategies: ['timeAlignedSubtract'] });
}
export async function rir(ctx) {
  return mkFauxECDemo(ctx, 'rir', { strategies: ['rir'] });
}
export async function lms(ctx) {
  return mkFauxECDemo(ctx, 'lms', { strategies: ['lms'] });
}
export async function playground(ctx) {
  return mkFauxECDemo(ctx, 'playground');
}

