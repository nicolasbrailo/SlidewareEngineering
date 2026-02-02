const m$ = (x) => document.getElementById(x);

/**
 * Resize canvas for high-DPI displays.
 * Sets canvas buffer to match display size × devicePixelRatio,
 * scales context so drawing uses CSS pixel coordinates.
 * Returns CSS dimensions for positioning calculations.
 */
const resizeCanvasHiDPI = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { width: rect.width, height: rect.height, dpr };
};

/**
 * Creates a 1D wave demo with optional mic/speaker.
 * @param {string} prefix - Element ID prefix (e.g., 'soundSamples', 'speakers')
 * @param {object} options - Configuration options
 * @param {boolean} options.hasMic - Whether to show mic and sample output
 * @param {boolean} options.hasSpeaker - Whether to show speaker on first dot
 */
async function create1DWaveDemo(prefix, audioCtx, options = {}) {
  const { hasMic = false, hasSpeaker = false } = options;

  const canvasEl = m$(`${prefix}_canvas`);
  const micOutput = hasMic ? m$(`${prefix}_micOutput`) : null;
  const freqInput = hasSpeaker ? m$(`${prefix}_frequency`) : null;
  const ampInput = hasSpeaker ? m$(`${prefix}_amplitude`) : null;
  const soundCheckbox = hasSpeaker ? m$(`${prefix}_sound`) : null;
  const c = canvasEl.getContext('2d');

  // Audio output state
  let oscillator = null;
  let gainNode = null;

  const startAudio = () => {
    if (oscillator || !audioCtx) return;
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    updateAudio();
    oscillator.start();
  };

  const stopAudio = () => {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
  };

  const updateAudio = () => {
    if (!oscillator || !freqInput || !ampInput) return;
    const freq = parseFloat(freqInput.value) || 440;
    const amp = parseFloat(ampInput.value) || 0;
    const gain = Math.min(0.25, Math.max(0, amp * 0.25)); // Map 0-1 to 0-0.25
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(gain, audioCtx.currentTime);
  };

  const onSoundToggle = () => {
    if (soundCheckbox && soundCheckbox.checked) {
      startAudio();
    } else {
      stopAudio();
    }
  };

  // Set up sound checkbox listener
  if (soundCheckbox) {
    soundCheckbox.addEventListener('change', onSoundToggle);
  }

  // Update audio when frequency/amplitude changes
  if (freqInput) freqInput.addEventListener('input', updateAudio);
  if (ampInput) ampInput.addEventListener('input', updateAudio);

  // Style mic output for horizontal scrolling (if present)
  if (micOutput) {
    micOutput.style.overflowX = 'auto';
    micOutput.style.whiteSpace = 'nowrap';
    micOutput.style.maxWidth = '100%';
    micOutput.style.fontFamily = 'monospace';
    micOutput.style.fontSize = '50%';
  }

  // Set up high-DPI canvas
  const { width: cssWidth, height: cssHeight } = resizeCanvasHiDPI(canvasEl);

  const visibleDots = 25;
  const ghostDots = 2; // Ghost dots on each side (not rendered, but simulated)
  const N = visibleDots + ghostDots * 2; // Total dots including ghosts
  const micDotIndex = hasMic ? ghostDots + visibleDots - 1 : -1; // Last visible dot (if mic enabled)
  const speakerDotIndex = hasSpeaker ? ghostDots : -1; // First visible dot (if speaker enabled)
  const dotRadius = 6;
  const springK = 0.6;
  const damping = 0.07;
  const restore = 0.02;
  const dt = 0.5;
  const micSampleInterval = 250; // ms

  // Speaker frequency mapping: 50-1000 Hz -> 0.25-10 Hz animation
  const mapFrequency = (realFreq) => {
    const minReal = 50, maxReal = 1000;
    const minAnim = 0.20, maxAnim = 5;
    const t = (realFreq - minReal) / (maxReal - minReal);
    return minAnim + t * (maxAnim - minAnim);
  };

  // State arrays: y position offset and velocity for each dot (including ghosts)
  const y = new Float32Array(N);
  const v = new Float32Array(N);

  // Dragging state
  let dragIndex = -1;
  let animationId = null;
  let micIntervalId = null;
  const micValues = [];
  let time = 0; // Time for speaker oscillation

  const getSpacing = () => (cssWidth - 40) / (visibleDots - 1);
  const getVisibleDotX = (vi) => 20 + vi * getSpacing(); // vi = visible index (0 to visibleDots-1)
  const getBaselineY = () => cssHeight / 2;

  const draw = () => {
    const baselineY = getBaselineY();

    c.fillStyle = '#1a1a2e';
    c.fillRect(0, 0, cssWidth, cssHeight);

    // Draw baseline
    c.strokeStyle = '#444';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(10, baselineY);
    c.lineTo(cssWidth - 10, baselineY);
    c.stroke();

    // Draw connecting lines between visible dots only
    c.strokeStyle = '#666';
    c.lineWidth = 1;
    c.beginPath();
    for (let vi = 0; vi < visibleDots; vi++) {
      const i = vi + ghostDots; // Convert to array index
      const x = getVisibleDotX(vi);
      const dotY = baselineY + y[i];
      if (vi === 0) {
        c.moveTo(x, dotY);
      } else {
        c.lineTo(x, dotY);
      }
    }
    c.stroke();

    // Draw visible dots only
    for (let vi = 0; vi < visibleDots; vi++) {
      const i = vi + ghostDots; // Convert to array index
      const x = getVisibleDotX(vi);
      const dotY = baselineY + y[i];

      c.beginPath();
      c.arc(x, dotY, dotRadius, 0, Math.PI * 2);
      c.fillStyle = (i === dragIndex) ? '#ff6b6b' : '#4ecdc4';
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.stroke();
    }

    // Draw "Speaker" rectangle (fixed position) if speaker enabled
    if (hasSpeaker) {
      const spkX = getVisibleDotX(0);
      const spkY = baselineY; // Speaker stays fixed at baseline
      const spkWidth = 30;
      const spkHeight = 125;

      c.fillStyle = '#3366cc';
      c.fillRect(spkX - spkWidth / 2, spkY - spkHeight / 2, spkWidth, spkHeight);
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.strokeRect(spkX - spkWidth / 2, spkY - spkHeight / 2, spkWidth, spkHeight);

      // Label "Speaker"
      c.fillStyle = '#fff';
      c.font = '12px sans-serif';
      c.textAlign = 'center';
      c.fillText('Speaker', spkX, spkY + spkHeight / 2 + 14);
    }

    // Draw "Mic" rectangle on the last visible dot (fixed position) if mic enabled
    if (hasMic) {
      const lastVi = visibleDots - 1;
      const micX = getVisibleDotX(lastVi);
      const micY = baselineY; // Mic stays at baseline
      const micWidth = 30;
      const micHeight = 40;

      c.fillStyle = '#cc3333';
      c.fillRect(micX - micWidth / 2, micY - micHeight / 2, micWidth, micHeight);
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.strokeRect(micX - micWidth / 2, micY - micHeight / 2, micWidth, micHeight);

      // Label "Mic"
      c.fillStyle = '#fff';
      c.font = '12px sans-serif';
      c.textAlign = 'center';
      c.fillText('Mic', micX, micY + micHeight / 2 + 14);
    }
  };

  const simulate = () => {
    // Drive speaker with sine wave if enabled
    if (hasSpeaker && freqInput && ampInput) {
      const realFreq = parseFloat(freqInput.value) || 440;
      const amplitude = parseFloat(ampInput.value) || 0;
      const animFreq = mapFrequency(realFreq);
      y[speakerDotIndex] = Math.sin(time * animFreq * Math.PI * 2) * amplitude * 50;
      time += 1 / 60; // Assume ~60fps
    }

    // Wave equation: F = k*(neighbors) - damping*v - restore*y
    for (let i = 0; i < N; i++) {
      if (i === dragIndex) continue; // Don't simulate dragged dot
      if (i === micDotIndex) continue; // Mic is fixed (if enabled)
      if (i === speakerDotIndex) continue; // Speaker is driven externally (if enabled)

      const left = (i > 0) ? y[i - 1] : 0;
      const right = (i < N - 1) ? y[i + 1] : 0;
      const force = springK * (left + right - 2 * y[i]) - damping * v[i] - restore * y[i];
      v[i] += force * dt;
    }

    for (let i = 0; i < N; i++) {
      if (i === dragIndex) continue;
      if (i === micDotIndex) continue; // Mic is fixed (if enabled)
      if (i === speakerDotIndex) continue; // Speaker is driven externally (if enabled)
      y[i] += v[i] * dt;
    }
  };

  const animate = () => {
    simulate();
    draw();
    animationId = requestAnimationFrame(animate);
  };

  const findDotAt = (mx, my) => {
    const baselineY = getBaselineY();
    // Only check visible dots
    for (let vi = 0; vi < visibleDots; vi++) {
      const i = vi + ghostDots; // Convert to array index
      const x = getVisibleDotX(vi);
      const dotY = baselineY + y[i];
      const dist = Math.sqrt((mx - x) ** 2 + (my - dotY) ** 2);
      if (dist <= dotRadius + 5) return i; // Return array index
    }
    return -1;
  };

  const getMousePos = (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // Return CSS pixel coordinates (context is scaled by DPR)
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const onPointerDown = (e) => {
    const pos = getMousePos(e);
    const idx = findDotAt(pos.x, pos.y);
    if (idx >= 0) {
      dragIndex = idx;
      v[idx] = 0;
      e.preventDefault();
    }
  };

  const onPointerMove = (e) => {
    if (dragIndex < 0) return;
    const pos = getMousePos(e);
    const baselineY = getBaselineY();
    y[dragIndex] = pos.y - baselineY;
    v[dragIndex] = 0;
    e.preventDefault();
  };

  const onPointerUp = () => {
    if (dragIndex >= 0) {
      v[dragIndex] = 0;
      dragIndex = -1;
    }
  };

  canvasEl.addEventListener('mousedown', onPointerDown);
  canvasEl.addEventListener('mousemove', onPointerMove);
  canvasEl.addEventListener('mouseup', onPointerUp);
  canvasEl.addEventListener('mouseleave', onPointerUp);
  canvasEl.addEventListener('touchstart', onPointerDown);
  canvasEl.addEventListener('touchmove', onPointerMove);
  canvasEl.addEventListener('touchend', onPointerUp);

  draw();
  animate();

  // Sample mic value periodically (reads from neighbor since mic is fixed)
  if (hasMic && micOutput) {
    micIntervalId = setInterval(() => {
      const val = y[micDotIndex - 1].toFixed(1);
      micValues.push(val);
      micOutput.textContent = micValues.join(', ');
      micOutput.scrollLeft = micOutput.scrollWidth;
    }, micSampleInterval);
  }

  return {
    cleanup: () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (micIntervalId) clearInterval(micIntervalId);
      stopAudio();
      if (soundCheckbox) soundCheckbox.removeEventListener('change', onSoundToggle);
      if (freqInput) freqInput.removeEventListener('input', updateAudio);
      if (ampInput) ampInput.removeEventListener('input', updateAudio);
      canvasEl.removeEventListener('mousedown', onPointerDown);
      canvasEl.removeEventListener('mousemove', onPointerMove);
      canvasEl.removeEventListener('mouseup', onPointerUp);
      canvasEl.removeEventListener('mouseleave', onPointerUp);
      canvasEl.removeEventListener('touchstart', onPointerDown);
      canvasEl.removeEventListener('touchmove', onPointerMove);
      canvasEl.removeEventListener('touchend', onPointerUp);
    },
  };
}

export async function soundSamples(ctx) {
  return create1DWaveDemo('soundSamples', ctx, { hasMic: true });
}

export async function speakers(ctx) {
  return create1DWaveDemo('speakers', ctx, { hasSpeaker: true });
}



/**
 * 2D Wave Propagation Demo
 * Simulates waves in a pond-like medium using the 2D wave equation.
 * Click or touch to create ripples.
 */

export async function soundTransmission(ctx) {
  const canvasEl = document.getElementById('soundTransmission_canvas');
  const c = canvasEl.getContext('2d');

  // Set up high-DPI canvas (reset transform since we do our own scaling)
  const rect = canvasEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvasEl.width = rect.width * dpr;
  canvasEl.height = rect.height * dpr;
  const cssWidth = rect.width;
  const cssHeight = rect.height;

  // Simulation parameters
  const resolution = 2; // Pixels per cell (lower = higher resolution, more CPU)
  const waveSpeed = 0.4; // Wave propagation speed
  const damping = 0.97; // Energy loss per frame (< 1 means waves decay)
  const dropRadius = 3; // Radius of initial disturbance in cells
  const dropStrength = 1.5; // Initial amplitude of disturbance

  let width, height; // Grid dimensions in cells
  let current, previous; // Wave height buffers (double buffering)
  let animationId = null;
  let imageData = null;

  const initGrid = () => {
    width = Math.floor(canvasEl.width / resolution);
    height = Math.floor(canvasEl.height / resolution);

    current = new Float32Array(width * height);
    previous = new Float32Array(width * height);
    imageData = c.createImageData(width, height);
  };

  const idx = (x, y) => y * width + x;

  const simulate = () => {
    const next = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = idx(x, y);

        // 2D wave equation: Laplacian of current state
        const laplacian =
          current[idx(x - 1, y)] +
          current[idx(x + 1, y)] +
          current[idx(x, y - 1)] +
          current[idx(x, y + 1)] -
          4 * current[i];

        // Wave equation with damping
        next[i] = (2 * current[i] - previous[i] + waveSpeed * waveSpeed * laplacian) * damping;
      }
    }

    // Swap buffers
    previous = current;
    current = next;
  };

  const render = () => {
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(x, y);
        const pixelIdx = i * 4;

        // Map wave height to color
        const h = current[i];

        // Base pond color (dark blue-green)
        let r = 20;
        let g = 60;
        let b = 80;

        // Add wave displacement as brightness variation
        const intensity = Math.tanh(h * 2) * 127;

        if (intensity > 0) {
          // Positive displacement: lighter blue/cyan
          r += intensity * 0.3;
          g += intensity * 0.8;
          b += intensity;
        } else {
          // Negative displacement: darker
          r += intensity * 0.2;
          g += intensity * 0.3;
          b += intensity * 0.5;
        }

        data[pixelIdx] = Math.max(0, Math.min(255, r));
        data[pixelIdx + 1] = Math.max(0, Math.min(255, g));
        data[pixelIdx + 2] = Math.max(0, Math.min(255, b));
        data[pixelIdx + 3] = 255;
      }
    }

    c.putImageData(imageData, 0, 0);

    // Scale up to canvas size
    c.imageSmoothingEnabled = true;
    c.drawImage(canvasEl, 0, 0, width, height, 0, 0, canvasEl.width, canvasEl.height);
  };

  const dropStone = (canvasX, canvasY) => {
    // Convert canvas coordinates to grid coordinates
    const gx = Math.floor(canvasX / resolution);
    const gy = Math.floor(canvasY / resolution);

    // Create circular disturbance
    for (let dy = -dropRadius; dy <= dropRadius; dy++) {
      for (let dx = -dropRadius; dx <= dropRadius; dx++) {
        const x = gx + dx;
        const y = gy + dy;

        if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) continue;

        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= dropRadius) {
          // Smooth falloff from center
          const factor = Math.cos((dist / dropRadius) * Math.PI * 0.5);
          current[idx(x, y)] += dropStrength * factor;
        }
      }
    }
  };

  const getCanvasPos = (e) => {
    const currentRect = canvasEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // Scale CSS coordinates to canvas buffer coordinates
    return {
      x: (clientX - currentRect.left) * dpr,
      y: (clientY - currentRect.top) * dpr,
    };
  };

  let isPointerDown = false;

  const onPointerDown = (e) => {
    isPointerDown = true;
    const pos = getCanvasPos(e);
    dropStone(pos.x, pos.y);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isPointerDown) return;
    const pos = getCanvasPos(e);
    dropStone(pos.x, pos.y);
    e.preventDefault();
  };

  const onPointerUp = () => {
    isPointerDown = false;
  };

  const animate = () => {
    simulate();
    render();
    animationId = requestAnimationFrame(animate);
  };

  // Initialize
  initGrid();

  // Event listeners
  canvasEl.addEventListener('mousedown', onPointerDown);
  canvasEl.addEventListener('mousemove', onPointerMove);
  canvasEl.addEventListener('mouseup', onPointerUp);
  canvasEl.addEventListener('mouseleave', onPointerUp);
  canvasEl.addEventListener('touchstart', onPointerDown, { passive: false });
  canvasEl.addEventListener('touchmove', onPointerMove, { passive: false });
  canvasEl.addEventListener('touchend', onPointerUp);

  // Start animation
  render();
  animate();

  return {
    cleanup: () => {
      if (animationId) cancelAnimationFrame(animationId);
      canvasEl.removeEventListener('mousedown', onPointerDown);
      canvasEl.removeEventListener('mousemove', onPointerMove);
      canvasEl.removeEventListener('mouseup', onPointerUp);
      canvasEl.removeEventListener('mouseleave', onPointerUp);
      canvasEl.removeEventListener('touchstart', onPointerDown);
      canvasEl.removeEventListener('touchmove', onPointerMove);
      canvasEl.removeEventListener('touchend', onPointerUp);
    },
  };
}
