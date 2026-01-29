/**
 * Creates a spectrogram analyzer and render object. Will render to a specified
 * canvas element.
 *
 *   ctx: audio context
 *   renderCanvasId: id of the element to render results
 *   cfg:
 *      fftSize: 2048,        // Bins
 *      timeSliceWidthPx: 5,  // How fast the plot moves to the left
 *      minFreq: 0,           // Min frequency to display (Hz)
 *      maxFreq: nyquist/2,   // Max frequency to display (Hz)
 *      scale: 'mel'          // Frequency scale: 'mel', 'log', or 'mel-compressed'
 *      renderFps: 30         // How often to render frames (default 30)
 *      analysisFps: 60       // How often to poll FFT data (default 60)
 *
 *  Returns an object: call connectInput(stream) to connect an audio stream,
 *  and stop() to stop render and clean up (can't be restarted)
 */
export function mkSpectrogramPlot(renderCanvasId, ctx, cfg={}) {
  const analyser = ctx.createAnalyser();
  analyser.smoothingTimeConstant = 0;
  analyser.fftSize = cfg.fftSize || 4096;

  // Display constants
  const displayCanvas = document.getElementById(renderCanvasId);
  const W = Math.round(window.getComputedStyle(displayCanvas)?.width?.slice(0, -2) || document.body.scrollWidth);
  const H = Math.round(window.getComputedStyle(displayCanvas)?.height?.slice(0, -2) || document.body.scrollHeight);

  // Size for each timeslice in the plot (which also determines the speed
  // with which the plot moves)
  const TIMESLICE_W = cfg.timeSliceWidthPx || 1;
  const MARGIN_BOTTOM = 20;
  const MARGIN_TOP = 20;
  const MARGIN_LEFT = 50;
  const MARGIN_RIGHT = 20;
  const PLOT_PADDING = 5;

  const tempCanvas = document.createElement('canvas');
  const displayCtx = displayCanvas.getContext('2d');
  const renderCtx = tempCanvas.getContext('2d');

  // Render helpers
  renderCtx.drawLine = (x1, y1, x2, y2, col=null) => {
    if (col !== null) {
      renderCtx.strokeStyle = col;
    }
    renderCtx.moveTo(x1, y1);
    renderCtx.lineTo(x2, y2);
  };

  const getColorForEnergy = (m) => {
    // Noise floor threshold - anything below this is black
    const NOISE_FLOOR = 50;
    if (m < NOISE_FLOOR) { return 'rgb(0,0,0)'; }

    // Map remaining range to 0-1
    const normalized = (m - NOISE_FLOOR) / (255 - NOISE_FLOOR);

    // Color stops: black -> blue -> cyan -> green -> yellow -> red -> white
    if (normalized < 0.2) {
      // Black to blue
      const t = normalized / 0.2;
      return `rgb(0, 0, ${Math.round(t * 180)})`;
    }
    if (normalized < 0.4) {
      // Blue to cyan
      const t = (normalized - 0.2) / 0.2;
      return `rgb(0, ${Math.round(t * 255)}, ${Math.round(180 + t * 75)})`;
    }
    if (normalized < 0.6) {
      // Cyan to green
      const t = (normalized - 0.4) / 0.2;
      return `rgb(0, 255, ${Math.round(255 * (1 - t))})`;
    }
    if (normalized < 0.8) {
      // Green to yellow
      const t = (normalized - 0.6) / 0.2;
      return `rgb(${Math.round(t * 255)}, 255, 0)`;
    }
    // Yellow to red to white
    const t = (normalized - 0.8) / 0.2;
    const r = 255;
    const g = Math.round(255 * (1 - t * 0.7));
    const b = Math.round(t * 200);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Frequency range configuration
  const nyquist = ctx.sampleRate / 2;
  const binBW = nyquist / analyser.frequencyBinCount;
  const minFreq = cfg.minFreq || 0;
  const maxFreq = cfg.maxFreq || (nyquist / 2);
  const plotHeight = H - MARGIN_TOP - MARGIN_BOTTOM;

  // Frequency scaling functions
  const scales = {
    // Standard mel scale
    mel: (f) => 2595 * Math.log10(1 + (f / 700)),
    // Logarithmic scale
    log: (f) => Math.log10(f + 1),
    // Mel with compressed highs - uses lower reference freq for more low-freq emphasis
    'mel-compressed': (f) => 2595 * Math.log10(1 + (f / 200)),
  };

  const scaleType = cfg.scale || 'mel';
  const scaleFunc = scales[scaleType] || scales.mel;
  const scaleMin = scaleFunc(minFreq);
  const scaleMax = scaleFunc(maxFreq);

  // Frame rate control
  const renderFps = cfg.renderFps || 30;
  const analysisFps = cfg.analysisFps || 60;
  const msPerRender = 1000 / renderFps;
  const msPerAnalysis = 1000 / analysisFps;

  // Convert frequency to Y position (clamped to display range)
  const freqToY = (freq) => {
    const h01 = (scaleFunc(freq) - scaleMin) / (scaleMax - scaleMin);
    return MARGIN_TOP + plotHeight * (1 - h01);
  };

  // Given an fft bin, return its start render position
  const binRenderStartY = (bin) => {
    const freq = binBW * bin;
    return freqToY(freq);
  };

  // Ensure everything has the same size
  displayCanvas.height = H;
  displayCanvas.width = W;
  tempCanvas.height = H;
  tempCanvas.width = W;

  // Draw fixed parts of canvas
  displayCtx.beginPath();
  displayCtx.strokeStyle = 'black';
  displayCtx.lineWidth = 2;
  displayCtx.moveTo(MARGIN_LEFT, MARGIN_TOP);
  displayCtx.lineTo(MARGIN_LEFT, H-MARGIN_BOTTOM);
  displayCtx.moveTo(MARGIN_LEFT, H-MARGIN_BOTTOM);
  displayCtx.lineTo(W-MARGIN_LEFT, H-MARGIN_BOTTOM);
  displayCtx.stroke();

  // Draw frequency scale on Y-axis
  const freqTicks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(f => f >= minFreq && f <= maxFreq);
  displayCtx.fillStyle = '#aaa';
  displayCtx.font = '12px sans-serif';
  displayCtx.textAlign = 'right';
  displayCtx.textBaseline = 'middle';
  displayCtx.strokeStyle = '#333';
  displayCtx.lineWidth = 1;

  for (const freq of freqTicks) {
    const y = freqToY(freq);
    if (y > MARGIN_TOP && y < H - MARGIN_BOTTOM) {
      // Tick mark
      displayCtx.beginPath();
      displayCtx.moveTo(MARGIN_LEFT - 5, y);
      displayCtx.lineTo(MARGIN_LEFT, y);
      displayCtx.stroke();

      // Label
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      displayCtx.fillText(label, MARGIN_LEFT - 8, y);
    }
  }

  let animation = null;
  let analysisInterval = null;
  let lastRenderTime = 0;

  // Buffer for FFT snapshots (decouples analysis rate from render rate)
  const fftBuffer = [];
  const minBin = Math.floor(minFreq / binBW);
  const maxBin = Math.min(Math.ceil(maxFreq / binBW), analyser.frequencyBinCount - 1);

  // Poll analyser at analysisFps rate
  analysisInterval = setInterval(() => {
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    fftBuffer.push(bins);
  }, msPerAnalysis);

  const renderNextFrame = (timestamp) => {
    // Throttle rendering to renderFps
    if (timestamp - lastRenderTime < msPerRender) {
      animation = requestAnimationFrame(renderNextFrame);
      return;
    }
    lastRenderTime = timestamp;

    // Get all buffered FFT slices
    const slices = fftBuffer.splice(0, fftBuffer.length);
    if (slices.length === 0) {
      animation = requestAnimationFrame(renderNextFrame);
      return;
    }

    // Copy current frame, shifted by total width of slices to draw
    const totalShift = slices.length * TIMESLICE_W;
    renderCtx.clearRect(0, 0, W, H);
    renderCtx.drawImage(displayCanvas, 0, 0, W, H, -totalShift, 0, W, H);

    // Plot each buffered timeslice
    for (let s = 0; s < slices.length; s++) {
      const bins = slices[s];
      const tPos = W - MARGIN_RIGHT - (slices.length - s) * TIMESLICE_W;

      renderCtx.beginPath();
      for (let i = minBin; i <= maxBin; ++i) {
        renderCtx.fillStyle = getColorForEnergy(bins[i]);
        const y1 = Math.min(binRenderStartY(i), H - MARGIN_BOTTOM);
        const y2 = Math.max(binRenderStartY(i + 1), MARGIN_TOP);
        if (y1 > y2) {
          renderCtx.fillRect(tPos, y2, TIMESLICE_W, y1 - y2);
        }
      }
      renderCtx.stroke();
    }

    // Copy to display
    displayCtx.drawImage(tempCanvas,
                        MARGIN_LEFT + PLOT_PADDING, MARGIN_BOTTOM + PLOT_PADDING, W, H,
                        MARGIN_LEFT + PLOT_PADDING, MARGIN_BOTTOM + PLOT_PADDING, W, H);

    // Register callback for next frame
    animation = requestAnimationFrame(renderNextFrame);
  };

  requestAnimationFrame(renderNextFrame);

  return {
    stop: () => {
      clearInterval(analysisInterval);
      cancelAnimationFrame(animation);
    },

    connectInput: (node) => {
      node.connect(analyser);
    },
  };
}
