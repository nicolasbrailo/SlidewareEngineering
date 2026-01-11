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
export function mkPlot(canvas, options = {}) {
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

  const clear = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    clear,
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
 * Draw a simple wave visualization on a canvas. Cb provides points to draw, frequency and amplitude
 * set the canvas x/y range
 */
export function drawWave(canvas, frequency, amplitude, cb) {
  // Amplitude scaled to ~1.0 max visual range
  const scaledAmp = 4 * amplitude;

  const plot = mkPlot(canvas, {
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

/**
 * Draw Y-axis with dBFS labels at standard amplitude positions.
 * Labels at ±1 (0 dB), ±0.5 (-6 dB), ±0.25 (-12 dB), and 0.
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
