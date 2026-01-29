import * as canvas from './canvas.js'
import * as noisy from './noisy.js'
import { visSpect01ToWavelength, wavelengthToRGB } from './colorHelpers.js';

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

export async function mkBasicToneDemo(prefix, ctx) {
  const frequencyRange = document.getElementById(`${prefix}_frequency`);
  const amplitudeRange = document.getElementById(`${prefix}_amplitude`);

  const freqConv = noisy.createLogLinConverter(`${prefix}_frequency`);
  const getFrequency = () => freqConv.linToLog();
  const getAmplitude = () => parseFloat(amplitudeRange.value);

  const redraw = () => canvas.drawSineWave(`${prefix}_canvas`, getFrequency(), getAmplitude());
  redraw();

  const osc = createOscillatorManager(ctx, null, getFrequency, getAmplitude);

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


