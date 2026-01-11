/* Creates an editor where a user can draw an audio frame */
export function mkCustomFrameEditor(canvasElmId, numPoints, cbOnChange) {
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


