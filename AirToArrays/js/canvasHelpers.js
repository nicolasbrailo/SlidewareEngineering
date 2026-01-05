/**
 * Canvas plotting helpers for high-DPI displays with coordinate system support.
 */

/**
 * Create a plot context with common drawing utilities.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element to draw on
 * @param {Object} options - Plot configuration options
 * @param {Object} options.padding - Padding around the plot area {top, right, bottom, left}
 * @param {number[]} options.xRange - X-axis range [min, max]
 * @param {number[]} options.yRange - Y-axis range [min, max]
 * @param {boolean} options.logX - Use logarithmic X-axis scaling
 * @param {boolean} options.logY - Use logarithmic Y-axis scaling
 * @returns {Object} Plot context with drawing methods
 */
export function createPlot(canvas, options = {}) {
  if (typeof canvas === "string") {
    canvas = document.getElementById(canvas);
  }

  const {
    padding = { top: 20, right: 20, bottom: 30, left: 50 },
    xRange = [0, 1],
    yRange = [0, 1],
    logX = false,
    logY = false,
  } = options;

  // Setup canvas for high-DPI displays
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /**
   * Convert X data coordinate to canvas coordinate.
   * @param {number} x - X value in data coordinates
   * @returns {number} X position in canvas pixels
   */
  const xToCanvas = (x) => {
    let ratio;
    if (logX && xRange[0] > 0) {
      ratio = Math.log(x / xRange[0]) / Math.log(xRange[1] / xRange[0]);
    } else {
      ratio = (x - xRange[0]) / (xRange[1] - xRange[0]);
    }
    return padding.left + ratio * plotWidth;
  };

  /**
   * Convert Y data coordinate to canvas coordinate.
   * @param {number} y - Y value in data coordinates
   * @returns {number} Y position in canvas pixels
   */
  const yToCanvas = (y) => {
    let ratio;
    if (logY && yRange[0] > 0) {
      ratio = Math.log(y / yRange[0]) / Math.log(yRange[1] / yRange[0]);
    } else {
      ratio = (y - yRange[0]) / (yRange[1] - yRange[0]);
    }
    return height - padding.bottom - ratio * plotHeight;
  };

  /**
   * Draw X and Y axes.
   */
  const drawAxes = () => {
    ctx.beginPath();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    // Y-axis
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    // X-axis
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();
  };

  /**
   * Draw Y-axis tick marks with labels.
   * @param {number} numTicks - Number of tick marks
   * @param {function} formatLabel - Function to format tick labels
   */
  const drawYTicks = (numTicks = 10, formatLabel = (v) => v.toFixed(0)) => {
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    for (let i = 0; i < numTicks; i++) {
      let value;
      if (logY && yRange[0] > 0) {
        value = yRange[0] * Math.pow(yRange[1] / yRange[0], i / (numTicks - 1));
      } else {
        value = yRange[0] + (yRange[1] - yRange[0]) * (i / (numTicks - 1));
      }
      const y = yToCanvas(value);
      // Tick mark
      ctx.beginPath();
      ctx.strokeStyle = '#888';
      ctx.moveTo(padding.left - 5, y);
      ctx.lineTo(padding.left, y);
      ctx.stroke();
      // Label
      ctx.fillText(formatLabel(value), 5, y + 4);
    }
  };

  /**
   * Draw X-axis tick marks with labels.
   * @param {number} numTicks - Number of tick marks
   * @param {function} formatLabel - Function to format tick labels
   */
  const drawXTicks = (numTicks = 5, formatLabel = (v) => v.toFixed(0)) => {
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    for (let i = 0; i < numTicks; i++) {
      let value;
      if (logX && xRange[0] > 0) {
        value = xRange[0] * Math.pow(xRange[1] / xRange[0], i / (numTicks - 1));
      } else {
        value = xRange[0] + (xRange[1] - xRange[0]) * (i / (numTicks - 1));
      }
      const x = xToCanvas(value);
      // Tick mark
      ctx.beginPath();
      ctx.strokeStyle = '#888';
      ctx.moveTo(x, height - padding.bottom);
      ctx.lineTo(x, height - padding.bottom + 5);
      ctx.stroke();
      // Label
      ctx.fillText(formatLabel(value), x - 10, height - 10);
    }
  };

  /**
   * Draw a horizontal line at a Y value.
   * @param {number} y - Y value in data coordinates
   * @param {string} color - Line color
   * @param {boolean} dashed - Whether to draw a dashed line
   */
  const drawHLine = (y, color = '#888', dashed = false) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.moveTo(padding.left, yToCanvas(y));
    ctx.lineTo(width - padding.right, yToCanvas(y));
    ctx.stroke();
    ctx.setLineDash([]);
  };

  /**
   * Draw a vertical line at an X value.
   * @param {number} x - X value in data coordinates
   * @param {string} color - Line color
   * @param {boolean} dashed - Whether to draw a dashed line
   */
  const drawVLine = (x, color = '#888', dashed = false) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.moveTo(xToCanvas(x), padding.top);
    ctx.lineTo(xToCanvas(x), height - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  /**
   * Draw a line/curve from an array of [x, y] points.
   * @param {number[][]} points - Array of [x, y] coordinate pairs
   * @param {string} color - Line color
   * @param {number} lineWidth - Line width in pixels
   */
  const drawLine = (points, color = '#000', lineWidth = 2) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    points.forEach(([x, y], i) => {
      const cx = xToCanvas(x);
      const cy = yToCanvas(y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
  };

  /**
   * Draw a filled circle at data coordinates.
   * @param {number} x - X value in data coordinates
   * @param {number} y - Y value in data coordinates
   * @param {number} radius - Circle radius in pixels
   * @param {string} color - Fill color
   */
  const drawDot = (x, y, radius = 6, color = '#c00') => {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(xToCanvas(x), yToCanvas(y), radius, 0, 2 * Math.PI);
    ctx.fill();
  };

  /**
   * Draw text at data coordinates with optional offset.
   * @param {string} text - Text to draw
   * @param {number} x - X value in data coordinates
   * @param {number} y - Y value in data coordinates
   * @param {string} color - Text color
   * @param {number} offsetX - X offset in pixels
   * @param {number} offsetY - Y offset in pixels
   */
  const drawText = (text, x, y, color = '#888', offsetX = 0, offsetY = 0) => {
    ctx.fillStyle = color;
    ctx.font = '12px sans-serif';
    ctx.fillText(text, xToCanvas(x) + offsetX, yToCanvas(y) + offsetY);
  };

  /**
   * Draw text at raw canvas coordinates.
   * @param {string} text - Text to draw
   * @param {number} canvasX - X position in canvas pixels
   * @param {number} canvasY - Y position in canvas pixels
   * @param {string} color - Text color
   */
  const drawTextRaw = (text, canvasX, canvasY, color = '#888') => {
    ctx.fillStyle = color;
    ctx.font = '12px sans-serif';
    ctx.fillText(text, canvasX, canvasY);
  };

  return {
    ctx,
    width,
    height,
    padding,
    plotWidth,
    plotHeight,
    xToCanvas,
    yToCanvas,
    drawAxes,
    drawYTicks,
    drawXTicks,
    drawHLine,
    drawVLine,
    drawLine,
    drawDot,
    drawText,
    drawTextRaw,
  };
}

/**
 * Draw a simple sine wave visualization on a canvas.
 * Used for basic tone demos showing frequency and amplitude.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} frequency - Frequency in Hz (affects wave density)
 * @param {number} amplitude - Amplitude (0 to ~0.25 typical)
 */
export function drawWave(canvas, frequency, amplitude, cb) {
  // Amplitude scaled to ~1.0 max visual range
  const scaledAmp = 4 * amplitude;

  const plot = createPlot(canvas, {
    padding: { top: 20, right: 10, bottom: 10, left: 10 },
    xRange: [0, 4 * Math.PI],
    yRange: [-1, 1],
  });

  // Draw center line (x-axis at y=0)
  plot.drawHLine(0, '#888', false);

  // Draw max amplitude line
  plot.drawHLine(scaledAmp, '#c00', true);

  // Labels
  plot.drawTextRaw(amplitude.toFixed(2), 5, plot.yToCanvas(scaledAmp) - 5, '#c00');
  plot.drawTextRaw(frequency.toFixed(0) + ' Hz', plot.width - 60, plot.yToCanvas(scaledAmp) - 5, '#00c');

  // Draw sine wave
  // Calculate number of points: at least canvas width, plus extra for high frequencies
  // The wave has (4π * frequency/480) / 2π = frequency/240 cycles
  // We want ~20 points per cycle for smooth rendering
  const numCycles = frequency / 240;
  const numPoints = Math.max(plot.plotWidth, Math.ceil(numCycles * 20));

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * 4 * Math.PI;
    const y = cb(scaledAmp, t);
    points.push([t, y]);
  }
  plot.drawLine(points, '#000', 2);
}

export function drawSineWave(canvas, frequency, amplitude) {
  // 480 is somewhat arbitrary, it works fine for my resolution to plot a few cycles at 400Hz
  const sin = (a, i) => a*Math.sin(i*frequency/480);
  return drawWave(canvas, frequency, amplitude, sin);
}

export function drawSawtoothWave(canvas, frequency, amplitude) {
  const cb = (a, i) => ((i*frequency/2000*Math.PI) % (2*a)) - a;
  return drawWave(canvas, frequency, amplitude, cb);
}

export function drawTriangleWave(canvas, frequency, amplitude) {
  const cb = (a, i) => 2*a*Math.asin(Math.sin(i*2*Math.PI / 1200 * frequency)) /  Math.PI;
  return drawWave(canvas, frequency, amplitude, cb);
}

export function drawSquareWave(canvas, frequency, amplitude) {
  const cb = (a, i) => a*(Math.sin(i*frequency/480) > 0? 1 : -1);
  return drawWave(canvas, frequency, amplitude, cb);
}

/**
 * Draw Y-axis with dBFS labels at standard amplitude positions.
 * Labels at ±1 (0 dB), ±0.5 (-6 dB), ±0.25 (-12 dB), and 0.
 *
 * @param {Object} plot - Plot context from createPlot
 */
export function drawDbfsYAxis(plot) {
  plot.drawAxes();
  const yTicks = [1, 0.5, 0.25, 0, -0.25, -0.5, -1];
  for (const amp of yTicks) {
    if (amp === 0) {
      plot.drawText('0', 0, 0, '#888', -20, 4);
    } else {
      // Convert to dBFS: 20 * log10(|amplitude|)
      const dbfs = (20 * Math.log10(Math.abs(amp))).toFixed(0);
      plot.drawText(dbfs, 0, amp, '#888', -25, 4);
    }
  }
}

/**
 * Draw colored amplitude notches on the Y-axis.
 * Each notch is drawn at ±amplitude with the specified color.
 *
 * @param {Object} plot - Plot context from createPlot
 * @param {Array} notches - Array of {amp, color} objects, drawn left-to-right
 *
 * @example
 * drawAmplitudeNotches(plot, [
 *   { amp: 0.4, color: '#00c' },  // Tone 1 (leftmost)
 *   { amp: 0.4, color: '#c00' },  // Tone 2
 *   { amp: 0.6, color: '#0c0' },  // Sum (rightmost, closest to axis)
 * ]);
 */
export function drawAmplitudeNotches(plot, notches) {
  const tickLen = 5;
  const numNotches = notches.length;

  notches.forEach((notch, i) => {
    const offset = (numNotches - i) * tickLen;
    const x1 = plot.padding.left - offset;
    const x2 = plot.padding.left - offset + tickLen;

    plot.ctx.beginPath();
    plot.ctx.strokeStyle = notch.color;
    plot.ctx.lineWidth = 2;
    plot.ctx.moveTo(x1, plot.yToCanvas(notch.amp));
    plot.ctx.lineTo(x2, plot.yToCanvas(notch.amp));
    plot.ctx.moveTo(x1, plot.yToCanvas(-notch.amp));
    plot.ctx.lineTo(x2, plot.yToCanvas(-notch.amp));
    plot.ctx.stroke();
  });
}

/**
 * Generate point arrays for two-tone visualization.
 * Returns three arrays: tone1, tone2, and their sum.
 *
 * @param {Object} options - Generation options
 * @param {number} options.freq1 - Frequency of tone 1 in Hz
 * @param {number} options.freq2 - Frequency of tone 2 in Hz
 * @param {number} options.phase - Phase offset for tone 2 in radians (default 0)
 * @param {number} options.amplitude - Base amplitude (default 0.1, scaled by 4 for display)
 * @param {number} options.plotWidth - Plot width for calculating num points
 * @returns {Object} { points1, points2, sum } - Arrays of [x, y] points
 *
 * @example
 * const { points1, points2, sum } = generateTwoTonePoints({
 *   freq1: 440, freq2: 440, phase: Math.PI / 2, amplitude: 0.1, plotWidth: 400
 * });
 * plot.drawLine(points1, '#00c', 2);
 * plot.drawLine(points2, '#c00', 2);
 * plot.drawLine(sum, '#0c0', 2);
 */
export function generateTwoTonePoints(options) {
  const { freq1, freq2, phase = 0, amplitude = 0.1, plotWidth = 400 } = options;

  const maxFreq = Math.max(freq1, freq2);
  const numCycles = maxFreq / 240;
  const numPoints = Math.max(plotWidth, Math.ceil(numCycles * 20));

  const points1 = [];
  const points2 = [];
  const sum = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * 4 * Math.PI;
    const y1 = amplitude * 4 * Math.sin(t * freq1 / 480);
    const y2 = amplitude * 4 * Math.sin(t * freq2 / 480 + phase);
    points1.push([t, y1]);
    points2.push([t, y2]);
    sum.push([t, y1 + y2]);
  }

  return { points1, points2, sum };
}

/* Extract a displayLen sized slice of samples that start on a zero-crossing. This will make rendering more
 * stable for timedomain data (it won't drift quite as much) */
export function alignToZeroXing(samples, displayLen) {
  const searchLimit = samples.length - displayLen;
  let triggerIndex = 0;
  for (let i = 1; i < searchLimit; i++) {
    if (samples[i - 1] <= 0 && samples[i] > 0) {
      triggerIndex = i;
      break;
    }
  }
  const points = [];
  for (let i = 0; i < displayLen; i++) {
    points.push([i, samples[triggerIndex + i]]);
  }
  return points;
};

export function buildTimeDomainPlot(canvas, ctx, cfg={}) {
  // TODO: Make configurable the fftSize, the samples to display, the yRange
  const displaySamples = 1024;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  const timedomainData = new Float32Array(analyser.fftSize);
  let animationFrameId = null;

  const draw = () => {
    analyser.getFloatTimeDomainData(timedomainData);
    const plot = createPlot(canvas, {
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      xRange: [0, displaySamples - 1],
      yRange: [-(cfg.yRange || .15), (cfg.yRange || .15)],
    });

    plot.drawHLine(0, '#888');
    plot.drawLine(alignToZeroXing(timedomainData, displaySamples), '#0c0', 1.5);

    // Request next
    animationFrameId = requestAnimationFrame(draw);
  };

  return {
    connectAndStart: (src) => {
      src.connect(analyser);
      draw();
    },

    stop: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      try { analyser.disconnect(); } catch (e) {}
    }
  };
}

/* Creates an editor where a user can draw an audio frame */
export function createCustomFrameEditor(canvasElmId, numPoints, cbOnChange) {
  const POINT_RADIUS = 4;

  const canvas = document.getElementById(canvasElmId);
  const canvasCtx = canvas.getContext('2d');

  // High-DPI setup
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvasCtx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    points.push(0);
  }

  // Coordinate conversion
  const xToCanvas = (i) => (i / (numPoints - 1)) * width;
  const yToCanvas = (y) => ((1 - y) / 2) * height; // y in [-1,1] -> canvas coords
  const canvasToY = (canvasY) => 1 - (canvasY / height) * 2; // canvas coords -> y in [-1,1]
  const canvasToPointIndex = (canvasX) => {
    const spacing = width / (numPoints - 1);
    return Math.round(canvasX / spacing);
  };

  const draw = () => {
    canvasCtx.clearRect(0, 0, width, height);

    // Draw zero line
    canvasCtx.strokeStyle = '#888';
    canvasCtx.setLineDash([5, 5]);
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, height / 2);
    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
    canvasCtx.setLineDash([]);

    // Draw waveform line
    canvasCtx.strokeStyle = '#00c';
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = xToCanvas(i);
      const y = yToCanvas(points[i]);
      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
    }
    canvasCtx.stroke();

    // Draw control points
    canvasCtx.fillStyle = '#c00';
    for (let i = 0; i < numPoints; i++) {
      const x = xToCanvas(i);
      const y = yToCanvas(points[i]);
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
      canvasCtx.fill();
    }
  };

  const reset = () => {
    for (let i = 0; i < numPoints; i++) {
      points[i] = 0;
    }
    draw();
    cbOnChange(points);
  }

  const randomize = () => {
    for (let i = 1; i < numPoints-1; i++) {
      points[i] = (Math.random()*2) - 1;
    }
    draw();
    // Easy way to ensure a periodic function
    points[0] = 0;
    points[numPoints-1] = 0;
    cbOnChange(points);
  }

  // Mouse interaction
  let isDragging = false;
  let dragIndex = -1;

  const getMousePos = (e) => {
    const canvasRect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - canvasRect.left,
      y: e.clientY - canvasRect.top
    };
  };

  const findPointAt = (pos) => {
    for (let i = 0; i < numPoints; i++) {
      const x = xToCanvas(i);
      const y = yToCanvas(points[i]);
      const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
      if (dist <= POINT_RADIUS + 4) {
        return i;
      }
    }
    return -1;
  };

  const onMouseDown = (e) => {
    const pos = getMousePos(e);
    const index = findPointAt(pos);
    if (index >= 0) {
      isDragging = true;
      dragIndex = index;
      canvas.style.cursor = 'grabbing';
    }
  };

  const onMouseMove = (e) => {
    const pos = getMousePos(e);

    if (isDragging && dragIndex >= 0) {
      // Update point Y value, clamped to [-1, 1]
      points[dragIndex] = Math.max(-1, Math.min(1, canvasToY(pos.y)));
      draw();
    } else {
      const index = findPointAt(pos);
      canvas.style.cursor = index >= 0 ? 'grab' : 'default';
    }
  };

  const onMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      dragIndex = -1;
      canvas.style.cursor = 'default';
      cbOnChange(points.slice());
    }
  };

  const onMouseLeave = () => {
    if (isDragging) {
      isDragging = false;
      dragIndex = -1;
      canvas.style.cursor = 'default';
      cbOnChange(points.slice());
    }
  };

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);

  reset();
  draw();

  return {
    reset,
    randomize,
    getFrame: () => points.slice(),
    destroy: () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
  };
}


