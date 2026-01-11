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


export async function noAEC(ctx) {
  await ctx.audioWorklet.addModule('js/noisy-processors/noisyFauxEC.js');

  const masterBus = ctx.createGain();
  masterBus.connect(ctx.destination);
  const renderTD = canvas.mkEnvelopePlot('noAEC_renderTd', ctx);
  renderTD.connectInput(masterBus);

  // Graph 1: connect a few sources to render, to simulate far end
  const farEndGain = ctx.createGain();
  farEndGain.gain.setValueAtTime(1, ctx.currentTime);
  farEndGain.connect(masterBus);
  ctx.createMediaElementSource(m$('noAEC_music')).connect(farEndGain);
  ctx.createMediaElementSource(m$('noAEC_speech1')).connect(farEndGain);
  ctx.createMediaElementSource(m$('noAEC_speech2')).connect(farEndGain);
  ctx.createMediaElementSource(m$('noAEC_speech3')).connect(farEndGain);

  // Graph 2: connect mic input, to capture near end and play it back later
  let mic = null;
  const micGain = ctx.createGain();
  const recorder = noisy.mkRecorder(ctx);
  const micTD = canvas.mkEnvelopePlot('noAEC_micTd', ctx);
  const fauxECNode = new AudioWorkletNode(ctx, 'noisy-faux-ec', {
    numberOfInputs: 2,
    numberOfOutputs: 2,
  });

  farEndGain.connect(fauxECNode, 0, 1);  // far-end = input 1
  fauxECNode.connect(micGain);           // out port 0 -> raw near end
  fauxECNode.connect(masterBus, 1);      // out port 1 -> speaker, used if the EC needs to override output
  recorder.connectInput(micGain);
  micTD.connectInput(micGain);
  // Loop back recorder output to speaker, so user can hear recroding
  recorder.getOutput().connect(masterBus);

  // Config setup
  const halfduplexCtrls = [
    ['noAEC_attackMs', 'noAEC_attackMs_val', 'attackMs'],
    ['noAEC_decayMs', 'noAEC_decayMs_val', 'decayMs'],
    ['noAEC_thresholdDb', 'noAEC_thresholdDb_val', 'thresholdDb'],
  ];
  const timealignerCtrls = [
    ['noAEC_taMinDelayMs', 'noAEC_taMinDelayMs_val', 'minDelayMs'],
    ['noAEC_taUpdateIntervalFrames', 'noAEC_taUpdateIntervalFrames_val', 'updateIntervalFrames'],
    ['noAEC_taEchoTimeWindowSizeMs', 'noAEC_taEchoTimeWindowSizeMs_val', 'echoTimeWindowSizeMs'],
    ['noAEC_taStepSize', 'noAEC_taStepSize_val', 'stepSize'],
    ['noAEC_taTxThresholdDb', 'noAEC_taTxThresholdDb_val', 'txThresholdDb'],
    ['noAEC_taRxThresholdDb', 'noAEC_taRxThresholdDb_val', 'rxThresholdDb'],
    ['noAEC_taSmoothingAlpha', 'noAEC_taSmoothingAlpha_val', 'smoothingAlpha'],
    ['noAEC_taNccThreshold', 'noAEC_taNccThreshold_val', 'nxcThreshold'],
    ['noAEC_taXcorrWindowSize', 'noAEC_taXcorrWindowSize_val', 'xcorrWindowSize'],
    ['noAEC_taEchoAttenuation', 'noAEC_taEchoAttenuation_val', 'echoAttenuation'],
  ];
  const rirCtrls = [
    ['noAEC_rirIrLength', 'noAEC_rirIrLength_val', 'irLength'],
    ['noAEC_rirMeasurementDurationMs', 'noAEC_rirMeasurementDurationMs_val', 'measurementDurationMs'],
    ['noAEC_rirTestSignalType', null, 'testSignalType'],
    ['noAEC_rirDiracPulseWidth', 'noAEC_rirDiracPulseWidth_val', 'diracPulseWidth'],
    ['noAEC_rirMlsOrder', 'noAEC_rirMlsOrder_val', 'mlsOrder'],
    ['noAEC_rirEchoAttenuation', 'noAEC_rirEchoAttenuation_val', 'echoAttenuation'],
  ];
  const formatIrLength = (samples) => {
    const ms = Math.round(samples / ctx.sampleRate * 1000);
    return `${samples} samples/${ms}ms`;
  };

  const updateAECCfgs = () => {
    // Configure everything that's configurable. Wasteful, but simpler
    fauxECNode.port.postMessage({ type: 'setMode', value: m$('noAEC_mode').value });
    fauxECNode.port.postMessage({
      type: 'timeAligned_config',
      value: {
        minDelayMs: Number(m$('noAEC_taMinDelayMs').value),
        updateIntervalFrames: Number(m$('noAEC_taUpdateIntervalFrames').value),
        echoTimeWindowSizeMs: Number(m$('noAEC_taEchoTimeWindowSizeMs').value),
        stepSize: Number(m$('noAEC_taStepSize').value),
        txThresholdDb: Number(m$('noAEC_taTxThresholdDb').value),
        rxThresholdDb: Number(m$('noAEC_taRxThresholdDb').value),
        smoothingAlpha: Number(m$('noAEC_taSmoothingAlpha').value),
        nxcThreshold: Number(m$('noAEC_taNccThreshold').value),
        xcorrWindowSize: Number(m$('noAEC_taXcorrWindowSize').value),
        echoAttenuation: Number(m$('noAEC_taEchoAttenuation').value),
      },
    });
    fauxECNode.port.postMessage({
      type: 'halfDuplex_config',
      value: {
        attackMs: Number(m$('noAEC_attackMs').value),
        decayMs: Number(m$('noAEC_decayMs').value),
        thresholdDb: Number(m$('noAEC_thresholdDb').value),
      },
    });
    fauxECNode.port.postMessage({
      type: 'rir_config',
      value: {
        irLength: Number(m$('noAEC_rirIrLength').value),
        measurementDurationMs: Number(m$('noAEC_rirMeasurementDurationMs').value),
        testSignalType: m$('noAEC_rirTestSignalType').value,
        diracPulseWidth: Number(m$('noAEC_rirDiracPulseWidth').value),
        mlsOrder: Number(m$('noAEC_rirMlsOrder').value),
        echoAttenuation: Number(m$('noAEC_rirEchoAttenuation').value),
      },
    });
  };

  // User interaction
  m$('noAEC_play').addEventListener('click', () => {
    recorder.playToggle(
      () => m$('noAEC_play').textContent = 'Stop',
      () => m$('noAEC_play').textContent = 'Play',
    );
  });
  m$('noAEC_rec').addEventListener('click', async () => {
    if (recorder.isRecording) {
      recorder.recordStop();
      mic && mic.disconnect();
      mic = null;
      m$('noAEC_rec').textContent = 'Mic enable';
      m$('noAEC_play').disabled = false;
    } else {
      mic = ctx.createMediaStreamSource(await noisy.getUserMic());
      mic.connect(fauxECNode);
      recorder.record();
      m$('noAEC_rec').textContent = 'Mic disable';
      m$('noAEC_play').disabled = true;
    }
  });

  // Config hooks
  for (const [inputId, valId] of [['noAEC_mode'], ...halfduplexCtrls, ...timealignerCtrls, ...rirCtrls]) {
    m$(inputId).addEventListener('input', (e) => {
      if (valId && m$(valId)) {
        if (inputId === 'noAEC_rirIrLength') {
          m$(valId).textContent = formatIrLength(e.target.value);
        } else {
          m$(valId).textContent = e.target.value;
        }
      }
      updateAECCfgs();
    });
  }

  // Request defaults from worklet and initialize UI
  let aecCfgRcvd = 0;
  fauxECNode.port.postMessage({ type: 'getDefaultConfigs' });
  fauxECNode.port.onmessage = (e) => {
    if (e.data.type === 'gated') {
      m$('noAEC_gated').style.color = e.data.value ? 'red' : 'green';
    } else if (e.data.type === 'stats') {
      m$('noAEC_stats').textContent = JSON.stringify(e.data.value);
    } else if (e.data.type === 'halfDuplexDefaults') {
      const defaults = e.data.value;
      for (const [inputId, valId, cfgKey] of halfduplexCtrls) {
        const val = defaults[cfgKey];
        m$(inputId).value = val;
        m$(valId).textContent = val;
      }
      if (++aecCfgRcvd == 3) updateAECCfgs();
    } else if (e.data.type === 'xCorrDefaults') {
      const defaults = e.data.value;
      for (const [inputId, valId, cfgKey] of timealignerCtrls) {
        const val = defaults[cfgKey];
        m$(inputId).value = val;
        m$(valId).textContent = val;
      }
      if (++aecCfgRcvd == 3) updateAECCfgs();
    } else if (e.data.type === 'rirDefaults') {
      const defaults = e.data.value;
      for (const [inputId, valId, cfgKey] of rirCtrls) {
        const val = defaults[cfgKey];
        m$(inputId).value = val;
        if (valId) {
          if (inputId === 'noAEC_rirIrLength') {
            m$(valId).textContent = formatIrLength(val);
          } else {
            m$(valId).textContent = val;
          }
        }
      }
      if (++aecCfgRcvd == 3) updateAECCfgs();
    } else if (e.data.type === 'debugTracks') {
      const { tracks, sampleRate: sr } = e.data.value;
      if (!tracks) return;
      for (const [filename, samples] of tracks) {
        noisy.floatToWavDownload(filename, samples, sr);
      }
      m$('noAEC_debugRec').textContent = 'Debug tracks';
    }
  };

  // Debug track recording
  let debugRecording = false;
  m$('noAEC_debugRec').addEventListener('click', () => {
    if (debugRecording) {
      fauxECNode.port.postMessage({ type: 'stopDebugRecording' });
      debugRecording = false;
    } else {
      fauxECNode.port.postMessage({ type: 'startDebugRecording' });
      m$('noAEC_debugRec').textContent = 'Stop & Download';
      debugRecording = true;
    }
  });

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
    },
  };
}

