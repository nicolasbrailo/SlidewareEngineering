import { createPlot, drawWave, drawSineWave, drawTriangleWave, drawSawtoothWave, createCustomFrameEditor,
         drawSquareWave, drawDbfsYAxis, drawAmplitudeNotches, generateTwoTonePoints, buildTimeDomainPlot } from './canvasHelpers.js';
import { createOscillatorManager, createDualOscillatorManager, createLogLinConverter, createMicRecorder,
         makeAudioMotionAnalyzer, toDbfs, formatFreq, createSignalReconstructor, getUserMic } from './audioHelpers.js';
import { visSpect01ToWavelength, wavelengthToRGB } from './colorHelpers.js';
import { createSpectrogramRenderer } from './spectrogramToCanvas.js';

export async function basicTone(ctx) {
  const frequencyRange = document.getElementById('basicTone_frequency');
  const amplitudeRange = document.getElementById('basicTone_amplitude');

  const getFrequency = () => parseFloat(frequencyRange.value);
  const getAmplitude = () => parseFloat(amplitudeRange.value);

  const redraw = () => drawSineWave('basicTone_canvas', getFrequency(), getAmplitude());
  redraw();

  const osc = createOscillatorManager(ctx, 'basicTone_startStop', getFrequency, getAmplitude);

  const onFrequencyChange = () => { osc.setFrequency(getFrequency()); redraw(); };
  const onAmplitudeChange = () => { osc.setAmplitude(getAmplitude()); redraw(); };

  frequencyRange.addEventListener('input', onFrequencyChange);
  amplitudeRange.addEventListener('input', onAmplitudeChange);

  return () => {
    osc.destroy();
    frequencyRange.removeEventListener('input', onFrequencyChange);
    amplitudeRange.removeEventListener('input', onAmplitudeChange);
  };
}

export async function toneColour(ctx) {
  const frequencyRange = document.getElementById('toneColour_frequency');
  const amplitudeRange = document.getElementById('toneColour_amplitude');
  const colorDisplay = document.getElementById('toneColour_colorDisplay');
  const colorInfo = document.getElementById('toneColour_colorInfo');

  const freqConv = createLogLinConverter(50, 10000);

  const getFrequency = () => parseFloat(frequencyRange.value);
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

  const osc = createOscillatorManager(ctx, 'toneColour_startStop', getFrequency, getAmplitude);

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

  return () => {
    osc.destroy();
    frequencyRange.removeEventListener('input', onFrequencyChange);
    amplitudeRange.removeEventListener('input', onAmplitudeChange);
  };
}

export async function logOrLinRange(ctx) {
  const frequencyLinRange = document.getElementById('logOrLinRange_frequency_lin');
  const frequencyLogRange = document.getElementById('logOrLinRange_frequency_log');
  const amplitudeLinRange = document.getElementById('logOrLinRange_amplitude_lin');
  const amplitudeLogRange = document.getElementById('logOrLinRange_amplitude_log');

  // Log scale conversion helpers
  // For frequency: 50-10000 Hz
  const freqMin = 50, freqMax = 10000;
  const logPosToFreq = (pos) => {
    const normalized = (pos - freqMin) / (freqMax - freqMin);
    return freqMin * Math.pow(freqMax / freqMin, normalized);
  };
  const freqToLogPos = (freq) => {
    const normalized = Math.log(freq / freqMin) / Math.log(freqMax / freqMin);
    return freqMin + normalized * (freqMax - freqMin);
  };

  // For amplitude: 0-0.25 (use small min for log scale)
  const ampMin = 0.001, ampMax = 0.25, ampSliderMin = 0, ampSliderMax = 0.25;
  const logPosToAmp = (pos) => {
    if (pos <= 0) return 0;
    const normalized = pos / ampSliderMax;
    return ampMin * Math.pow(ampMax / ampMin, normalized);
  };
  const ampToLogPos = (amp) => {
    if (amp <= 0) return 0;
    const clamped = Math.max(ampMin, amp);
    const normalized = Math.log(clamped / ampMin) / Math.log(ampMax / ampMin);
    return normalized * ampSliderMax;
  };

  const getFrequency = () => parseFloat(frequencyLinRange.value);
  const getAmplitude = () => parseFloat(amplitudeLinRange.value);

  const redraw = () => drawSineWave('logOrLinRange_canvas', getFrequency(), getAmplitude());

  // Sync log sliders to initial linear values
  frequencyLogRange.value = freqToLogPos(getFrequency());
  amplitudeLogRange.value = ampToLogPos(getAmplitude());
  redraw();

  const osc = createOscillatorManager(ctx, 'logOrLinRange_startStop', getFrequency, getAmplitude);

  const onFrequencyLinChange = () => {
    const freq = getFrequency();
    frequencyLogRange.value = freqToLogPos(freq);
    osc.setFrequency(freq);
    redraw();
  };

  const onFrequencyLogChange = () => {
    const freq = logPosToFreq(parseFloat(frequencyLogRange.value));
    frequencyLinRange.value = freq;
    osc.setFrequency(freq);
    redraw();
  };

  const onAmplitudeLinChange = () => {
    const amp = getAmplitude();
    amplitudeLogRange.value = ampToLogPos(amp);
    osc.setAmplitude(amp);
    redraw();
  };

  const onAmplitudeLogChange = () => {
    const amp = logPosToAmp(parseFloat(amplitudeLogRange.value));
    amplitudeLinRange.value = amp;
    osc.setAmplitude(amp);
    redraw();
  };

  frequencyLinRange.addEventListener('input', onFrequencyLinChange);
  frequencyLogRange.addEventListener('input', onFrequencyLogChange);
  amplitudeLinRange.addEventListener('input', onAmplitudeLinChange);
  amplitudeLogRange.addEventListener('input', onAmplitudeLogChange);

  return () => {
    osc.destroy();
    frequencyLinRange.removeEventListener('input', onFrequencyLinChange);
    frequencyLogRange.removeEventListener('input', onFrequencyLogChange);
    amplitudeLinRange.removeEventListener('input', onAmplitudeLinChange);
    amplitudeLogRange.removeEventListener('input', onAmplitudeLogChange);
  };
}

export async function logHumanHearing(ctx) {
  const startStopLinBtn = document.getElementById('logHumanHearing_startStopLin');
  const startStopLogBtn = document.getElementById('logHumanHearing_startStopLog');

  const freqMin = 50;
  const freqMax = 5000;
  const sweepDuration = 5000;
  const amplitude = 0.1;

  let animationId = null;
  let sweepStartTime = null;
  let isLogarithmic = false;

  const getFrequencyAtProgress = (progress, logarithmic) => {
    if (logarithmic) {
      return freqMin * Math.pow(freqMax / freqMin, progress);
    } else {
      return freqMin + (freqMax - freqMin) * progress;
    }
  };

  const getCurrentFrequency = (elapsed) => {
    const progress = Math.min(elapsed / sweepDuration, 1);
    return getFrequencyAtProgress(progress, isLogarithmic);
  };

  const osc = createOscillatorManager(ctx, null, () => freqMin, () => amplitude);

  const drawFrequencyPlot = (canvas, logYAxis, currentElapsed) => {
    const plot = createPlot(canvas, {
      padding: { top: 20, right: 20, bottom: 30, left: 50 },
      xRange: [0, sweepDuration],
      yRange: [freqMin, freqMax],
      logY: logYAxis,
    });

    plot.drawAxes();
    plot.drawYTicks(10, formatFreq);

    // X-axis labels
    plot.drawTextRaw('0s', plot.padding.left, plot.height - 10);
    plot.drawTextRaw(`${(sweepDuration / 1000).toFixed(0)}s`, plot.width - plot.padding.right - 15, plot.height - 10);

    // Full curve (faded preview)
    const fullCurve = [];
    for (let i = 0; i <= 100; i++) {
      const progress = i / 100;
      fullCurve.push([progress * sweepDuration, getFrequencyAtProgress(progress, isLogarithmic)]);
    }
    plot.drawLine(fullCurve, '#ccc', 2);

    // Traversed portion
    if (currentElapsed > 0) {
      const traversed = [];
      const steps = Math.ceil((currentElapsed / sweepDuration) * 100);
      for (let i = 0; i <= steps; i++) {
        const progress = Math.min(i / 100, currentElapsed / sweepDuration);
        traversed.push([progress * sweepDuration, getFrequencyAtProgress(progress, isLogarithmic)]);
      }
      plot.drawLine(traversed, '#00c', 3);

      // Current position dot and label
      const currentFreq = getCurrentFrequency(currentElapsed);
      plot.drawDot(currentElapsed, currentFreq, 6, '#c00');
      plot.drawText(`${currentFreq.toFixed(0)} Hz`, currentElapsed, currentFreq, '#c00', 10, -10);
    }
  };

  const redraw = (elapsed) => {
    drawFrequencyPlot('logHumanHearing_canvasLin', false, elapsed);
    drawFrequencyPlot('logHumanHearing_canvasLog', true, elapsed);
  };

  const updateSweep = () => {
    const elapsed = performance.now() - sweepStartTime;
    if (elapsed >= sweepDuration) {
      redraw(sweepDuration);
      stop();
      return;
    }

    const freq = getCurrentFrequency(elapsed);
    osc.setFrequency(freq);
    redraw(elapsed);
    animationId = requestAnimationFrame(updateSweep);
  };

  const start = (logarithmic) => {
    isLogarithmic = logarithmic;
    osc.start();
    sweepStartTime = performance.now();
    updateSweep();

    startStopLinBtn.textContent = 'Stop';
    startStopLogBtn.textContent = 'Stop';
  };

  const stop = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    osc.stop();
    startStopLinBtn.textContent = 'Start linear sweep';
    startStopLogBtn.textContent = 'Start log sweep';
  };

  const onLinClick = () => {
    if (osc.isRunning()) {
      stop();
    } else {
      start(false);
    }
  };

  const onLogClick = () => {
    if (osc.isRunning()) {
      stop();
    } else {
      start(true);
    }
  };

  redraw(0);

  startStopLinBtn.addEventListener('click', onLinClick);
  startStopLogBtn.addEventListener('click', onLogClick);

  return () => {
    stop();
    startStopLinBtn.removeEventListener('click', onLinClick);
    startStopLogBtn.removeEventListener('click', onLogClick);
  };
}

export async function logLoudnessHearing(ctx) {
  const amplitudeLinRange = document.getElementById('logLoudnessHearing_amplitude_lin');
  const amplitudeLogRange = document.getElementById('logLoudnessHearing_amplitude_log');

  // Log scale conversion helpers for amplitude (0-1 range)
  const ampMin = 0.001, ampMax = 1;
  const logPosToAmp = (pos) => {
    if (pos <= 0) return 0;
    const normalized = pos / ampMax;
    return ampMin * Math.pow(ampMax / ampMin, normalized);
  };
  const ampToLogPos = (amp) => {
    if (amp <= 0) return 0;
    const clamped = Math.max(ampMin, amp);
    const normalized = Math.log(clamped / ampMin) / Math.log(ampMax / ampMin);
    return normalized * ampMax;
  };

  const getAmplitude = () => parseFloat(amplitudeLinRange.value);

  const drawAmplitudePlot = (amplitude) => {
    const plot = createPlot('logLoudnessHearing_canvas', {
      padding: { top: 20, right: 200, bottom: 30, left: 30 },
      xRange: [0, 2 * Math.PI],
      yRange: [-1, 1],
    });

    // Draw axes and horizontal line at y=0
    plot.drawAxes();
    plot.drawHLine(0, '#888', false);

    // Reference lines
    plot.drawHLine(1, '#00c', true);        // Max amplitude (blue)
    plot.drawHLine(amplitude, '#c00', true); // Current amplitude (red)

    // Y-axis labels
    plot.drawText('1', 0, 1, '#888', -25, 4);
    plot.drawText('0', 0, 0, '#888', -20, 4);
    plot.drawText('-1', 0, -1, '#888', -25, 4);

    // X-axis labels
    plot.drawTextRaw('0', plot.padding.left, plot.height - 10);
    plot.drawTextRaw('2π', plot.width - plot.padding.right - 15, plot.height - 10);

    // Right side: amplitude info
    const rightX = plot.width - plot.padding.right + 10;
    const headroom = 1 - amplitude;
    plot.drawTextRaw(`Amplitude: ${amplitude.toFixed(2)} (Lin); ${toDbfs(amplitude)} dBFS`, rightX, plot.yToCanvas(0.5), '#c00');
    plot.drawTextRaw(`Headroom: ${headroom.toFixed(2)} (Lin); ${toDbfs(headroom)} dBFS`, rightX, plot.yToCanvas(0.5) + 16, '#00c');

    // Sine wave
    const points = [];
    for (let i = 0; i <= 100; i++) {
      const x = (i / 100) * 2 * Math.PI;
      points.push([x, amplitude * Math.sin(x)]);
    }
    plot.drawLine(points, '#000', 2);
  };

  // Sync log slider to initial linear value
  amplitudeLogRange.value = ampToLogPos(getAmplitude());
  drawAmplitudePlot(getAmplitude());

  const onAmplitudeLinChange = () => {
    const amp = getAmplitude();
    amplitudeLogRange.value = ampToLogPos(amp);
    drawAmplitudePlot(amp);
  };

  const onAmplitudeLogChange = () => {
    const amp = logPosToAmp(parseFloat(amplitudeLogRange.value));
    amplitudeLinRange.value = amp;
    drawAmplitudePlot(amp);
  };

  amplitudeLinRange.addEventListener('input', onAmplitudeLinChange);
  amplitudeLogRange.addEventListener('input', onAmplitudeLogChange);

  return () => {
    amplitudeLinRange.removeEventListener('input', onAmplitudeLinChange);
    amplitudeLogRange.removeEventListener('input', onAmplitudeLogChange);
  };
}

export async function twoTonePhase(ctx) {
  const startStopBtn = document.getElementById('twoTonePhase_startStop');
  const freqSlider = document.getElementById('twoTonePhase_freq');
  const phaseSlider = document.getElementById('twoTonePhase_phase');

  const amplitude = 0.1;
  const getFreq = () => parseFloat(freqSlider.value);
  const getPhase = () => parseFloat(phaseSlider.value) * 2 * Math.PI;

  const dual = createDualOscillatorManager(ctx, startStopBtn, getFreq, getFreq, {
    amplitude,
    freqRange: [50, 1000],
    phaseEnabled: true,
    getPhase,
  });

  const drawWaves = () => {
    const freq = dual.getFreq1Hz();
    const phase = getPhase();

    const plot = createPlot('twoTonePhase_canvas', {
      padding: { top: 20, right: 80, bottom: 20, left: 45 },
      xRange: [0, 4 * Math.PI],
      yRange: [-1, 1],
    });

    drawDbfsYAxis(plot);
    plot.drawHLine(0, '#888', false);

    const toneAmp = amplitude * 4;
    const sumAmp = 2 * toneAmp * Math.abs(Math.cos(phase / 2));
    drawAmplitudeNotches(plot, [
      { amp: toneAmp, color: '#00c' },
      { amp: toneAmp, color: '#c00' },
      { amp: sumAmp, color: '#0c0' },
    ]);

    const { points1, points2, sum } = generateTwoTonePoints({
      freq1: freq, freq2: freq, phase, amplitude, plotWidth: plot.plotWidth,
    });
    plot.drawLine(points1, '#00c', 2);
    plot.drawLine(points2, '#c00', 2);
    plot.drawLine(sum, '#0c0', 2);

    plot.drawTextRaw(`${formatFreq(freq)} Hz`, plot.width - 70, 20, '#000');
    plot.drawTextRaw(`Phase: ${(phase / Math.PI).toFixed(2)}π`, plot.width - 70, 36, '#000');
    plot.drawTextRaw('Tone 1', plot.width - 70, 56, '#00c');
    plot.drawTextRaw('Tone 2', plot.width - 70, 72, '#c00');
  };

  const updateFreq = () => { dual.setFreq1(getFreq()); drawWaves(); };
  const updatePhase = () => { dual.setPhase(); drawWaves(); };

  drawWaves();

  startStopBtn.addEventListener('click', dual.toggle);
  freqSlider.addEventListener('input', updateFreq);
  phaseSlider.addEventListener('input', updatePhase);

  return () => {
    dual.stop();
    startStopBtn.removeEventListener('click', dual.toggle);
    freqSlider.removeEventListener('input', updateFreq);
    phaseSlider.removeEventListener('input', updatePhase);
  };
}

export async function twoToneTwoFreq(ctx) {
  const startStopBtn = document.getElementById('twoToneTwoFreq_startStop');
  const freq1Slider = document.getElementById('twoToneTwoFreq_freq1');
  const freq2Slider = document.getElementById('twoToneTwoFreq_freq2');

  const amplitude = 0.1;
  const getFreq1 = () => parseFloat(freq1Slider.value);
  const getFreq2 = () => parseFloat(freq2Slider.value);

  const dual = createDualOscillatorManager(ctx, startStopBtn, getFreq1, getFreq2, {
    amplitude,
    freqRange: [50, 1000],
    sharedGain: false,
  });

  const drawWaves = () => {
    const freq1 = dual.getFreq1Hz();
    const freq2 = dual.getFreq2Hz();

    const plot = createPlot('twoToneTwoFreq_canvas', {
      padding: { top: 20, right: 80, bottom: 20, left: 45 },
      xRange: [0, 4 * Math.PI],
      yRange: [-1, 1],
    });

    drawDbfsYAxis(plot);
    plot.drawHLine(0, '#888', false);

    const toneAmp = amplitude * 4;
    drawAmplitudeNotches(plot, [
      { amp: toneAmp, color: '#00c' },
      { amp: toneAmp, color: '#c00' },
    ]);

    const { points1, points2, sum } = generateTwoTonePoints({
      freq1, freq2, amplitude, plotWidth: plot.plotWidth,
    });
    plot.drawLine(points1, '#00c', 2);
    plot.drawLine(points2, '#c00', 2);
    plot.drawLine(sum, '#0c0', 2);

    plot.drawTextRaw(`F1: ${formatFreq(freq1)} Hz`, plot.width - 75, 20, '#00c');
    plot.drawTextRaw(`F2: ${formatFreq(freq2)} Hz`, plot.width - 75, 36, '#c00');
  };

  const updateFreq1 = () => { dual.setFreq1(getFreq1()); drawWaves(); };
  const updateFreq2 = () => { dual.setFreq2(getFreq2()); drawWaves(); };

  drawWaves();

  startStopBtn.addEventListener('click', dual.toggle);
  freq1Slider.addEventListener('input', updateFreq1);
  freq2Slider.addEventListener('input', updateFreq2);

  return () => {
    dual.stop();
    startStopBtn.removeEventListener('click', dual.toggle);
    freq1Slider.removeEventListener('input', updateFreq1);
    freq2Slider.removeEventListener('input', updateFreq2);
  };
}

export async function twoToneAnalysis(ctx) {
  const startStopBtn = document.getElementById('twoToneAnalysis_startStop');
  const freq1Slider = document.getElementById('twoToneAnalysis_freq1');
  const freq2Slider = document.getElementById('twoToneAnalysis_freq2');

  const amplitude = 0.1;
  const fft = makeAudioMotionAnalyzer(ctx, 'twoToneAnalysis_fft', {maxFreq: 1000});
  const getFreq1 = () => parseFloat(freq1Slider.value);
  const getFreq2 = () => parseFloat(freq2Slider.value);

  const dual = createDualOscillatorManager(ctx, startStopBtn, getFreq1, getFreq2, {
    amplitude,
    freqRange: [50, 1000],
    sharedGain: true,
  });

  // Custom toggle that connects FFT after starting
  const toggle = () => {
    if (dual.isRunning()) {
      fft.disconnectInput();
      dual.stop();
    } else {
      dual.start();
      fft.connectInput(dual.getOutputNode());
    }
  };

  const updateFreq1 = () => dual.setFreq1(getFreq1());
  const updateFreq2 = () => dual.setFreq2(getFreq2());

  startStopBtn.addEventListener('click', toggle);
  freq1Slider.addEventListener('input', updateFreq1);
  freq2Slider.addEventListener('input', updateFreq2);

  return () => {
    fft.destroy();
    dual.stop();
    startStopBtn.removeEventListener('click', toggle);
    freq1Slider.removeEventListener('input', updateFreq1);
    freq2Slider.removeEventListener('input', updateFreq2);
  };
}

export async function waveshape(ctx) {
  const startStopBtn = document.getElementById('waveshape_startStop');
  const freqRange = document.getElementById('waveshape_freq');
  const shape = document.getElementById('waveshape_shape');
  const fft = makeAudioMotionAnalyzer(ctx, 'waveshape_fft', {maxFreq: 5000});
  let redraw = null;

  const freqConv = createLogLinConverter(50, 1000);
  const getFrequency = () => freqConv.linToLog(parseFloat(freqRange.value));

  const osc = createOscillatorManager(ctx, null, getFrequency, () => .1);

  const onShapeChange = () => {
    osc.setType(shape.value);
    if (shape.value == 'square') {
      redraw = () => drawSquareWave('waveshape_canvas', getFrequency(), .1);
    } else if (shape.value == 'triangle') {
      redraw = () => drawTriangleWave('waveshape_canvas', getFrequency(), .1);
    } else if (shape.value == 'sawtooth') {
      redraw = () => drawSawtoothWave('waveshape_canvas', getFrequency(), .1);
    } else {
      redraw = () => drawSineWave('waveshape_canvas', getFrequency(), .1);
    }
    redraw();
  };

  const onFrequencyChange = () => { osc.setFrequency(getFrequency()); redraw(); };

  onShapeChange();

  startStopBtn.addEventListener('click', () => {
    if (osc.isRunning()) {
      fft.disconnectInput();
      osc.stop();
    } else {
      osc.start();
      fft.connectInput(osc.getOsc());
    }
  });
  freqRange.addEventListener('input', onFrequencyChange);
  shape.addEventListener('change', onShapeChange);

  return () => {
    fft.destroy();
    osc.stop();
    startStopBtn.removeEventListener('click', osc.toggle);
    freqRange.removeEventListener('input', onFrequencyChange);
    shape.removeEventListener('change', onShapeChange);
  };
}

export async function customWaveshape(ctx) {
  const interpolateFrame = (srcPoints, wantedPointCount, interpolation='linear') => {
    const result = new Float32Array(wantedPointCount);

    if (interpolation === 'linear') {
      for (let i = 0; i < wantedPointCount; i++) {
        const pos = (i / wantedPointCount) * (srcPoints.length - 1);
        const idx = Math.floor(pos);
        const frac = pos - idx;

        if (idx >= srcPoints.length - 1) {
          result[i] = srcPoints[srcPoints.length - 1];
        } else {
          result[i] = srcPoints[idx] * (1 - frac) + srcPoints[idx + 1] * frac;
        }
      }
      return result;
    }

    // Cardinal spline interpolation with tension parameter
    // s = (1-tension)/2, where:
    //   s = 0 -> linear interpolation
    //   s = 0.5 -> Catmull-Rom (default)
    //   s > 0.5 -> looser, smoother curves
    const cardinalSpline = (p0, p1, p2, p3, t, s) => {
      const t2 = t * t;
      const t3 = t2 * t;
      return (
        p0 * (s * (-t3 + 2 * t2 - t)) +
        p1 * ((2 - s) * t3 + (s - 3) * t2 + 1) +
        p2 * ((s - 2) * t3 + (3 - 2 * s) * t2 + s * t) +
        p3 * (s * (t3 - t2))
      );
    };

    const n = srcPoints.length;
    for (let i = 0; i < wantedPointCount; i++) {
      const pos = (i / wantedPointCount) * (n - 1);
      const idx = Math.floor(pos);
      const t = pos - idx;

      // Get 4 surrounding points with wrapping
      const p0 = srcPoints[(idx - 1 + n) % n];
      const p1 = srcPoints[idx % n];
      const p2 = srcPoints[(idx + 1) % n];
      const p3 = srcPoints[(idx + 2) % n];
      const tension = 5; // Adjust for different levels of smoothing
      result[i] = cardinalSpline(p0, p1, p2, p3, t, tension);
    }
    return result;
  };

  const userControlableDots = 32;
  const FRAME_SAMPLES = 940; // ~15ms

  // Audio buffer setup
  let bufferSource = null;
  let gain = null;
  const fftPlot = makeAudioMotionAnalyzer(ctx, 'customWaveshape_fft', { maxFreq: 5000 });
  const sinkTDPlot = buildTimeDomainPlot('customWaveshape_timedomainSink', ctx);

  const updateWaveform = (frame) => {
    const samples = interpolateFrame(frame, FRAME_SAMPLES, document.getElementById('customWaveshape_interpolation').value);
    console.log(samples)
    document.getElementById('customWaveshape_frame').value = Array.from(samples).map(s => Number(s).toFixed(1)).join(',');

    // Create audio buffer with interpolated samples
    const buffer = ctx.createBuffer(1, FRAME_SAMPLES, ctx.sampleRate);
    buffer.getChannelData(0).set(samples);

    // Stop previous source if playing
    if (bufferSource) {
      bufferSource.stop();
      bufferSource.disconnect();
    }

    // Create new looping buffer source
    bufferSource = ctx.createBufferSource();
    bufferSource.buffer = buffer;
    bufferSource.loop = true;

    if (!gain) {
      gain = ctx.createGain();
      gain.gain.value = 0.2;
      gain.connect(ctx.destination);
      fftPlot.connectInput(gain);
      sinkTDPlot.connectAndStart(gain);
    }

    bufferSource.connect(gain);
    bufferSource.start();
  };

  const editor = createCustomFrameEditor('customWaveshape_editor', userControlableDots, (frame) => {
    updateWaveform(frame);
  });
  const onInterpolationChange = () => {
    updateWaveform(editor.getFrame());
  };

  document.getElementById('customWaveshape_reset').addEventListener('click', editor.reset);
  document.getElementById('customWaveshape_randomize').addEventListener('click', editor.randomize);
  document.getElementById('customWaveshape_interpolation').addEventListener('change', onInterpolationChange);

  return () => {
    try { bufferSource.stop(); bufferSource.disconnect(); } catch(e) {}
    try { gain.disconnect(); } catch(e) {}
    document.getElementById('customWaveshape_reset').removeEventListener('click', editor.reset);
    document.getElementById('customWaveshape_randomize').removeEventListener('click', editor.randomize);
    document.getElementById('customWaveshape_interpolation').removeEventListener('change', onInterpolationChange);
    try { fftPlot.destroy(); } catch (e) {}
    try { sinkTDPlot.stop(); } catch (e) {}
    try { editor.destroy(); } catch (e) {}
  };
}

export async function fftApprox(ctx) {
  const startStopBtn = document.getElementById('fftApprox_startStop');
  const freqRange = document.getElementById('fftApprox_freq');
  const shape = document.getElementById('fftApprox_shape');
  const termsSlider = document.getElementById('fftApprox_terms');
  const bypass = document.getElementById('fftApprox_bypass');

  const getFrequency = () => createLogLinConverter(50, 1000).linToLog(parseFloat(freqRange.value));
  const getNumTerms = () => parseInt(termsSlider.value);

  const reconstructor = createSignalReconstructor(ctx, { fftSize: 4096 });
  const sinkTDPlot = buildTimeDomainPlot('fftApprox_timedomainSink', ctx);
  const fftPlot = makeAudioMotionAnalyzer(ctx, 'fftApprox_fft', { maxFreq: 5000 });

  const amplitude = 0.1;

  // Input oscillator (the signal to analyze)
  let inputOsc = null;
  let inputGain = null;
  let isRunning = false;

  // Plot what the reconstructor is sending to the speakers
  const redrawReconstruct = () => {
    drawWave('fftApprox_timedomainReconstruct', getFrequency(), amplitude, (a, t) => {
      let y = 0;
      for (const term of reconstructor.getTerms()) {
        const K = 120; // An arbitrary number to plot just a few cycles
        y += term.magnitude * 4 * Math.sin(t * term.freq / K);
      }
      return y;
    });
  };

  const start = () => {
    if (isRunning) return;

    // Create input oscillator and connect to reconstructor's input
    inputOsc = ctx.createOscillator();
    inputGain = ctx.createGain();

    inputOsc.type = shape.value;
    inputOsc.frequency.value = getFrequency();
    inputGain.gain.value = amplitude;

    inputOsc.connect(inputGain);
    inputGain.connect(reconstructor.getInputNode());

    inputOsc.start();

    // Connect sink to destination and visualizers
    reconstructor.getOutputNode().connect(ctx.destination);
    fftPlot.connectInput(reconstructor.getOutputNode());
    sinkTDPlot.connectAndStart(reconstructor.getOutputNode());

    isRunning = true;
    startStopBtn.textContent = 'Stop';
    updateDemoCfg();
  };

  const stop = () => {
    if (!isRunning) return;

    try { inputOsc.stop(); inputOsc.disconnect(); } catch (e) {}
    try { inputGain.disconnect(); } catch (e) {}
    reconstructor.stop();
    sinkTDPlot.stop();

    inputOsc = null;
    inputGain = null;
    isRunning = false;
    startStopBtn.textContent = 'Start';
  };

  const toggle = () => {
    if (isRunning) {
      stop();
    } else {
      start();
    }
  };

  const updateDemoCfg = () => {
    if (isRunning && inputOsc) {
      inputOsc.type = shape.value;
      inputOsc.frequency.value = getFrequency();
      reconstructor.setNumTerms(getNumTerms());
      // Checkbox checked = reconstructed, unchecked = bypass (original)
      reconstructor.setBypass(bypass.checked);
      reconstructor.analyzeAndStart(redrawReconstruct);
    }
  };

  // Event listeners
  startStopBtn.addEventListener('click', toggle);
  freqRange.addEventListener('input', updateDemoCfg);
  shape.addEventListener('change', updateDemoCfg);
  termsSlider.addEventListener('input', updateDemoCfg);
  bypass.addEventListener('change', updateDemoCfg);

  return () => {
    stop();
    reconstructor.stop();
    fftPlot.destroy();
    startStopBtn.removeEventListener('click', toggle);
    freqRange.removeEventListener('input', updateDemoCfg);
    shape.removeEventListener('change', updateDemoCfg);
    termsSlider.removeEventListener('input', updateDemoCfg);
    bypass.removeEventListener('change', updateDemoCfg);
  };
}


export async function fftSpeech(ctx) {
  const playBtn = document.getElementById('fftSpeech_play');
  const termsSlider = document.getElementById('fftSpeech_terms');
  const bypass = document.getElementById('fftSpeech_bypass');
  const continuous = document.getElementById('fftSpeech_continuous');

  const RECORD_DURATION_MS = 1000;
  const getNumTerms = () => parseInt(termsSlider.value);

  const reconstructor = createSignalReconstructor(ctx, { fftSize: 4096 });
  const recordedTDPlot = buildTimeDomainPlot('fftSpeech_timedomainRecorded', ctx, {yRange: 1});
  const sinkTDPlot = buildTimeDomainPlot('fftSpeech_timedomainSink', ctx, {yRange: 1});
  const fftPlot = makeAudioMotionAnalyzer(ctx, 'fftSpeech_fft', { maxFreq: 5000 });

  let bufferSource = null;
  let isPlaying = false;
  let isRecording = false;
  let analyzeIntervalId = null;

  const startAnalyzeInterval = () => {
    if (analyzeIntervalId) return;
    analyzeIntervalId = setInterval(() => {
      reconstructor.analyzeAndStart(() => {});
    }, 50);
  };

  const stopAnalyzeInterval = () => {
    if (analyzeIntervalId) {
      clearInterval(analyzeIntervalId);
      analyzeIntervalId = null;
    }
  };

  const recorder = createMicRecorder('fftSpeech_record', ctx);

  const play = () => {
    if (!recorder.getRecordedBuffer() || isPlaying) return;

    // Create buffer source with loop
    bufferSource = ctx.createBufferSource();
    bufferSource.buffer = recorder.getRecordedBuffer();
    bufferSource.loop = true;

    // Connect to reconstructor and visualizers
    bufferSource.connect(reconstructor.getInputNode());
    recordedTDPlot.connectAndStart(bufferSource);

    reconstructor.getOutputNode().connect(ctx.destination);
    fftPlot.connectInput(reconstructor.getOutputNode());
    sinkTDPlot.connectAndStart(reconstructor.getOutputNode());

    // Set config
    reconstructor.setNumTerms(getNumTerms());
    reconstructor.setBypass(bypass.checked);
    reconstructor.analyzeAndStart(()=>{});

    // Continuously re-analyze to track changing frequencies (if enabled)
    if (continuous.checked) {
      startAnalyzeInterval();
    }

    bufferSource.start();
    isPlaying = true;
    playBtn.textContent = 'Stop';
  };

  const stopPlayback = () => {
    if (!isPlaying) return;

    stopAnalyzeInterval();

    if (bufferSource) {
      try { bufferSource.stop(); bufferSource.disconnect(); } catch (e) {}
      bufferSource = null;
    }

    recordedTDPlot.stop();
    sinkTDPlot.stop();
    reconstructor.stop();

    isPlaying = false;
    playBtn.textContent = 'Play';
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      play();
    }
  };

  const updateDemoCfg = () => {
    if (isPlaying) {
      reconstructor.setNumTerms(getNumTerms());
      reconstructor.setBypass(bypass.checked);
      reconstructor.analyzeAndStart(()=>{});
    }
  };

  const onContinuousChange = () => {
    if (!isPlaying) return;
    if (continuous.checked) {
      startAnalyzeInterval();
    } else {
      stopAnalyzeInterval();
    }
  };

  // Event listeners
  playBtn.addEventListener('click', togglePlay);
  termsSlider.addEventListener('input', updateDemoCfg);
  bypass.addEventListener('change', updateDemoCfg);
  continuous.addEventListener('change', onContinuousChange);

  return () => {
    stopPlayback();
    reconstructor.stop();
    fftPlot.destroy();
    recorder.destroy();
    playBtn.removeEventListener('click', togglePlay);
    termsSlider.removeEventListener('input', updateDemoCfg);
    bypass.removeEventListener('change', updateDemoCfg);
    continuous.removeEventListener('change', onContinuousChange);
  };
}

export async function humanVoice(ctx) {
  const plot = createSpectrogramRenderer(ctx, 'humanVoice_fft', {fftSize: 4096, timeSliceWidthPx: 2});
  const stream = await getUserMic();
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
  return () => {
    document.getElementById('humanVoice_src').removeEventListener('change', updateSrc);
    plot.stop();
    stream.getTracks().forEach(track => track.stop());
    mic.disconnect();
    mic = null;
  };
}


