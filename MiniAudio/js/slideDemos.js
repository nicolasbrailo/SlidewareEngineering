import * as canvas from './canvas.js'
import * as noisy from './noisy.js'
import { visSpect01ToWavelength, wavelengthToRGB } from './colorHelpers.js';
import { soundTransmission, soundSamples, speakers } from './soundTransmission.js';

export { soundTransmission, soundSamples, speakers };

const m$ = (x) => document.getElementById(x);

export function createOscillatorManager(audioCtx, startStopBtnId, getFrequency, getAmplitude, options = {}) {
  const startStopBtn = startStopBtnId? document.getElementById(startStopBtnId) : null;
  const freqLabel = options.freqLabelId ? document.getElementById(options.freqLabelId) : null;
  const ampLabel = options.ampLabelId ? document.getElementById(options.ampLabelId) : null;
  const updateLabels = options.updateLabels ?? false;
  let oscillator = null;
  let gainNode = null;
  let oscType = 'sine';

  const updateFreqLabel = (freq) => {
    if (updateLabels && freqLabel) {
      freqLabel.textContent = `${freq.toFixed(0)}Hz`;
    }
  };

  const updateAmpLabel = (amp) => {
    if (updateLabels && ampLabel) {
      const db = amp > 0 ? 20 * Math.log10(amp) : -Infinity;
      ampLabel.textContent = db === -Infinity ? '-∞dB' : `${db.toFixed(1)}dB`;
    }
  };

  /**
   * Start the oscillator with current frequency and amplitude.
   */
  const start = () => {
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    const freq = getFrequency();
    const amp = getAmplitude();
    oscillator.frequency.value = freq;
    oscillator.type = oscType;
    gainNode.gain.value = amp;

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();

    updateFreqLabel(freq);
    updateAmpLabel(amp);

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
    updateFreqLabel(freq);
  };

  /**
   * Update gain (amplitude) in real-time.
   * @param {number} amp - New amplitude (0-1)
   */
  const setAmplitude = (amp) => {
    if (gainNode) {
      gainNode.gain.value = amp;
    }
    updateAmpLabel(amp);
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


export async function mkBasicToneDemo(prefix, ctx, options = {}) {
  const frequencyRange = document.getElementById(`${prefix}_frequency`);
  const amplitudeRange = document.getElementById(`${prefix}_amplitude`);

  const freqConv = noisy.createLogLinConverter(`${prefix}_frequency`);
  const getFrequency = () => freqConv.linToLog();
  const getAmplitude = () => parseFloat(amplitudeRange.value);

  const redraw = () => {
    if (m$(`${prefix}_canvas`)) {
      canvas.drawSineWave(`${prefix}_canvas`, getFrequency(), getAmplitude());
    }
  }
  redraw();

  const osc = createOscillatorManager(ctx, null, getFrequency, getAmplitude, options);

  const onFrequencyChange = () => { osc.setFrequency(getFrequency()); redraw(); };
  const onAmplitudeChange = () => { osc.setAmplitude(getAmplitude()); redraw(); };

  frequencyRange.addEventListener('input', onFrequencyChange);
  amplitudeRange.addEventListener('input', onAmplitudeChange);

  return {
    start: osc.start,
    stop: osc.stop,
    cleanup: () => {
      osc.destroy();
      frequencyRange.removeEventListener('input', onFrequencyChange);
      amplitudeRange.removeEventListener('input', onAmplitudeChange);
    },
  };
}

export async function basicTone(ctx) { return mkBasicToneDemo('basicTone', ctx); }
export async function highPitch(ctx) { return mkBasicToneDemo('highPitch', ctx); }
export async function testTone(ctx) {
  return mkBasicToneDemo('testTone', ctx, {
    freqLabelId: 'testTone_freqLabel',
    ampLabelId: 'testTone_ampLabel',
    updateLabels: true,
  });
}

export async function toneColour(ctx) {
  const frequencyRange = document.getElementById('toneColour_frequency');
  const amplitudeRange = document.getElementById('toneColour_amplitude');
  const colorDisplay = document.getElementById('toneColour_colorDisplay');
  const colorInfo = document.getElementById('toneColour_colorInfo');

  const freqConv = noisy.createLogLinConverter('toneColour_frequency');
  const getFrequency = () => freqConv.linToLog();
  const getAmplitude = () => parseFloat(amplitudeRange.value);

  const updateColor = () => {
    const freq = getFrequency();
    const amp = getAmplitude();

    // Map frequency to 0-1 range (log scale for perceptual uniformity)
    const freqRatio = freqConv.logToLin(freq);

    // Convert to wavelength and then to RGB
    const wavelength = visSpect01ToWavelength(freqRatio);
    const [r, g, b] = wavelengthToRGB(wavelength, amp * 4); // Scale amplitude for visibility

    // Update display
    colorDisplay.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    colorInfo.textContent = `${freq.toFixed(0)} Hz → ${wavelength.toFixed(0)} nm → rgb(${r}, ${g}, ${b})`;
  };

  updateColor();

  const osc = createOscillatorManager(ctx, null, getFrequency, getAmplitude);

  const onFrequencyChange = () => {
    osc.setFrequency(getFrequency());
    updateColor();
  };

  const onAmplitudeChange = () => {
    osc.setAmplitude(getAmplitude());
    updateColor();
  };

  frequencyRange.addEventListener('input', onFrequencyChange);
  amplitudeRange.addEventListener('input', onAmplitudeChange);

  return {
    start: osc.start,
    stop: osc.stop,
    cleanup: () => {
      osc.destroy();
      frequencyRange.removeEventListener('input', onFrequencyChange);
      amplitudeRange.removeEventListener('input', onAmplitudeChange);
    },
  };
}

export async function humanVoice(ctx) {
  const plot = canvas.mkSpectrogramPlot('humanVoice_fft', ctx, {
    fftSize: 8192,
    timeSliceWidthPx: 1,
    minFreq: 100,
    maxFreq: 6000,
    scale: 'mel-compressed',
  });
  const stream = await noisy.getUserMic();
  let mic = ctx.createMediaStreamSource(stream);
  let osc = ctx.createOscillator();
  let gain = ctx.createGain();

  plot.connectInput(gain);

  gain.gain.value = 0.8;
  osc.start();

  const updateSrc = () => {
    // Disconnect both inputs. One of these will throw, the other should succeed.
    try { mic.disconnect(gain); } catch(e) {}
    try { osc.disconnect(gain); } catch(e) {}
    if (document.getElementById('humanVoice_src').value == 'mic') {
      mic.connect(gain);
    } else {
      osc.type = document.getElementById('humanVoice_src').value;
      osc.connect(gain);
    }
  };

  updateSrc();

  document.getElementById('humanVoice_src').addEventListener('change', updateSrc);
  return {
    cleanup: () => {
      document.getElementById('humanVoice_src').removeEventListener('change', updateSrc);
      plot.stop();
      stream.getTracks().forEach(track => track.stop());
      mic.disconnect();
      mic = null;
    },
  };
}

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


