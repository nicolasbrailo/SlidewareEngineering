# Air to Arrays - impress.js Presentation

## Project Structure

- `index.html` - Main presentation file
- `js/slideDemos.js` - Interactive demo functions for slides
- `js/canvasHelpers.js` - Canvas/plotting utilities (high-DPI, axes, curves)
- `js/audioHelpers.js` - Web Audio API utilities (oscillators, microphone)
- `js/colorHelpers.js` - Color utilities (visible spectrum, wavelength to RGB)
- `js/app.js` - Application entry point
- `css/` - Stylesheets
- `img/` - Images
- `extdeps/` - External dependencies

## Slide Conventions

Each slide is a `<div>` with class `step slide` and a unique `id`:

```html
<div class="step slide" id="mySlide">
  <h2>Slide Title</h2>
  <!-- content -->
</div>
```

### Positioning
- First slide uses `data-x` and `data-y` for absolute position
- Second slide defines `data-rel-y` for default relative movement
- Subsequent slides auto-position unless overridden

### Element Naming
All element IDs within a slide are prepended with the slide ID:
```html
<div class="step slide" id="exampleSlide">
  <button id="exampleSlide_button">Click</button>
  <input id="exampleSlide_input" />
  <canvas id="exampleSlide_canvas"></canvas>
</div>
```

### Styling Rules
- No inline styles on HTML elements
- Use CSS classes only
- No inline event handlers (onclick, etc.)

## Demo System (`js/slideDemos.js`)

When a slide loads, the app looks for an exported function matching the slide ID.

### Demo Function Pattern

```javascript
export async function mySlide(ctx) {
  // ctx is an AudioContext (for audio demos)

  // 1. Get DOM elements
  const button = document.getElementById('mySlide_button');
  const canvas = document.getElementById('mySlide_canvas');

  // 2. Set up state and helpers
  const state = { running: false };

  // 3. Define event handlers
  const onClick = () => { /* ... */ };

  // 4. Attach listeners
  button.addEventListener('click', onClick);

  // 5. Return cleanup function
  return () => {
    // Stop any running processes
    // Remove all event listeners
    button.removeEventListener('click', onClick);
  };
}
```

### Key Points
- Function name must match slide ID exactly
- Receives AudioContext as parameter
- Must return a cleanup function (or null if no cleanup needed)
- Cleanup runs when navigating away from the slide
- Hook up all callbacks in JS, not in HTML

## Adding a New Slide

1. Add HTML to `index.html`:
```html
<div class="step slide" id="newSlide">
  <h2>Title</h2>
  <button id="newSlide_action">Do Thing</button>
  <canvas id="newSlide_canvas"></canvas>
</div>
```

2. If interactive, add demo to `js/slideDemos.js`:
```javascript
export async function newSlide(ctx) {
  const btn = document.getElementById('newSlide_action');
  const canvas = document.getElementById('newSlide_canvas');

  const handler = () => { /* ... */ };
  btn.addEventListener('click', handler);

  return () => {
    btn.removeEventListener('click', handler);
  };
}
```

## Helper Modules

Always use these helpers when creating new demos. Import them at the top of `slideDemos.js`.

### Canvas Helpers (`js/canvasHelpers.js`)

```javascript
import { createPlot, drawSineWave, drawDbfsYAxis, drawAmplitudeNotches, generateTwoTonePoints } from './canvasHelpers.js';
```

#### `createPlot(canvas, options)`
Creates a plot context with high-DPI support and drawing utilities.

**Options:**
- `padding` - `{top, right, bottom, left}` in pixels
- `xRange` - `[min, max]` for X-axis
- `yRange` - `[min, max]` for Y-axis
- `logX` / `logY` - Use logarithmic scaling

**Returns object with:**
- `ctx`, `width`, `height`, `padding`, `plotWidth`, `plotHeight`
- `xToCanvas(x)`, `yToCanvas(y)` - Coordinate converters
- `drawAxes()` - Draw X and Y axes
- `drawYTicks(n, formatFn)`, `drawXTicks(n, formatFn)` - Axis ticks with labels
- `drawHLine(y, color, dashed)`, `drawVLine(x, color, dashed)` - Reference lines
- `drawLine(points, color, width)` - Curve from `[[x,y], ...]`
- `drawDot(x, y, radius, color)` - Circle marker
- `drawText(text, x, y, color, offsetX, offsetY)` - Text at data coords
- `drawTextRaw(text, canvasX, canvasY, color)` - Text at canvas coords

**Example:**
```javascript
const plot = createPlot(canvas, {
  padding: { top: 20, right: 20, bottom: 30, left: 50 },
  xRange: [0, 100],
  yRange: [0, 1000],
  logY: true,
});
plot.drawAxes();
plot.drawYTicks(10, (v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0));
plot.drawLine([[0, 100], [50, 500], [100, 1000]], '#00c', 2);
plot.drawDot(50, 500, 6, '#c00');
```

#### `drawSineWave(canvas, frequency, amplitude)`
Simple sine wave visualization for basic tone demos.

#### `drawDbfsYAxis(plot)`
Draw Y-axis with dBFS labels at standard amplitude positions (±1, ±0.5, ±0.25, 0).

```javascript
const plot = createPlot(canvas, { yRange: [-1, 1], ... });
drawDbfsYAxis(plot);  // Adds axis with 0, -6, -12 dB labels
```

#### `drawAmplitudeNotches(plot, notches)`
Draw colored notches on the Y-axis at specified amplitude levels.

```javascript
drawAmplitudeNotches(plot, [
  { amp: 0.4, color: '#00c' },  // Tone 1 (leftmost)
  { amp: 0.4, color: '#c00' },  // Tone 2
  { amp: 0.6, color: '#0c0' },  // Sum (rightmost)
]);
```

#### `generateTwoTonePoints(options)`
Generate point arrays for two-tone visualization.

**Options:**
- `freq1`, `freq2` - Frequencies in Hz
- `phase` - Phase offset for tone 2 in radians (default 0)
- `amplitude` - Base amplitude (default 0.1, scaled ×4 for display)
- `plotWidth` - Plot width for calculating point density

**Returns:** `{ points1, points2, sum }` - Arrays of `[x, y]` points

```javascript
const { points1, points2, sum } = generateTwoTonePoints({
  freq1: 440, freq2: 440, phase: Math.PI / 2, amplitude: 0.1, plotWidth: 400,
});
plot.drawLine(points1, '#00c', 2);
plot.drawLine(points2, '#c00', 2);
plot.drawLine(sum, '#0c0', 2);
```

### Audio Helpers (`js/audioHelpers.js`)

```javascript
import { createOscillatorManager, getUserMic, createLogLinConverter, toDbfs, formatFreq } from './audioHelpers.js';
```

#### `createLogLinConverter(min, max)`
Creates converters between linear (0-1) and logarithmic scales. Useful for frequency/amplitude sliders where human perception is logarithmic.

**Returns object with:**
- `linToLog(linPos)` - Convert linear position (0-1) to log-scaled value
- `logToLin(logVal)` - Convert log-scaled value to linear position (0-1)
- `min`, `max` - The original range values

**Example:**
```javascript
const freqConv = createLogLinConverter(50, 10000);
const freq = freqConv.linToLog(0.5);  // ~707 Hz (geometric mean)
const pos = freqConv.logToLin(1000);  // ~0.565
```

#### `toDbfs(amplitude)`
Converts a linear amplitude (0-1) to dBFS string.
- `toDbfs(1.0)` → `"0"`
- `toDbfs(0.5)` → `"-6"`
- `toDbfs(0)` → `"-∞"`

#### `formatFreq(freq)`
Formats frequency for display, using 'k' suffix for thousands.
- `formatFreq(440)` → `"440"`
- `formatFreq(2500)` → `"2.5k"`

#### `createOscillatorManager(audioCtx, startStopBtn, getFrequency, getAmplitude)`
Manages an oscillator with start/stop control.

**Returns object with:**
- `start()`, `stop()`, `toggle()` - Playback control
- `setFrequency(freq)`, `setAmplitude(amp)` - Real-time updates

**Example:**
```javascript
const osc = createOscillatorManager(
  ctx,
  document.getElementById('mySlide_button'),
  () => parseFloat(freqSlider.value),
  () => parseFloat(ampSlider.value)
);
button.addEventListener('click', osc.toggle);
freqSlider.addEventListener('input', () => osc.setFrequency(parseFloat(freqSlider.value)));
// Cleanup
return () => { osc.stop(); /* remove listeners */ };
```

#### `createDualOscillatorManager(audioCtx, startStopBtn, getFreq1, getFreq2, options)`
Manages two oscillators with start/stop control. Useful for demos with two tones.

**Options:**
- `amplitude` - Gain value (default 0.1)
- `sharedGain` - Use single shared gain node (default true). Set to `false` for separate gain per oscillator.
- `phaseEnabled` - Add DelayNode on osc2 for phase control (default false). When enabled, both oscillators use `getFreq1`.
- `getPhase` - Function returning phase in radians (required if phaseEnabled)
- `freqRange` - `[min, max]` Hz range for log-scale conversion. When set, `getFreq1`/`getFreq2` should return linear 0-1 values (raw slider positions), and the manager converts them to Hz internally.

**Returns object with:**
- `start()`, `stop()`, `toggle()` - Playback control
- `setFreq1(val)`, `setFreq2(val)` - Real-time frequency updates (accepts 0-1 if `freqRange` set, else Hz)
- `setPhase()` - Update phase delay (reads from `getPhase`)
- `getOutputNode()` - Returns the gain node (for connecting to FFT, etc.)
- `isRunning()` - Returns true if oscillators are currently playing
- `getFreq1Hz()`, `getFreq2Hz()` - Get current frequency in Hz (useful for drawing when using `freqRange`)

**Example (two frequencies with freqRange):**
```javascript
const getFreq1 = () => parseFloat(freq1Slider.value);  // raw 0-1 slider value
const getFreq2 = () => parseFloat(freq2Slider.value);

const dual = createDualOscillatorManager(ctx, btn, getFreq1, getFreq2, {
  amplitude: 0.1,
  freqRange: [50, 1000],  // manager converts 0-1 to 50-1000 Hz (log scale)
});
freq1Slider.addEventListener('input', () => dual.setFreq1(getFreq1()));

// For drawing, get the converted Hz value:
const freq1Hz = dual.getFreq1Hz();
```

**Example (same frequency with phase):**
```javascript
const getFreq = () => parseFloat(freqSlider.value);  // raw 0-1 slider value
const getPhase = () => parseFloat(phaseSlider.value) * 2 * Math.PI;

const dual = createDualOscillatorManager(ctx, btn, getFreq, getFreq, {
  amplitude: 0.1,
  freqRange: [50, 1000],
  phaseEnabled: true,
  getPhase,
});
freqSlider.addEventListener('input', () => dual.setFreq1(getFreq()));
phaseSlider.addEventListener('input', () => dual.setPhase());
```

#### `getUserMic()`
Returns a Promise for microphone MediaStream with optimal audio settings.

### Color Helpers (`js/colorHelpers.js`)

```javascript
import { visSpect01ToWavelength, wavelengthToRGB } from './colorHelpers.js';
```

#### `visSpect01ToWavelength(visSpect01)`
Maps a normalized 0-1 value to a visible light wavelength.

- **Input**: `visSpect01` - Value from 0 to 1
- **Output**: Wavelength in nanometers (390-680 nm)
- 0 → 680 nm (red end)
- 1 → 390 nm (violet end)

#### `wavelengthToRGB(wavelength, intensity_max)`
Converts a light wavelength to an RGB color tuple.

- **Input**:
  - `wavelength` - Wavelength in nanometers (380-780 nm)
  - `intensity_max` - Optional intensity multiplier (0-1, default 1)
- **Output**: `[r, g, b]` array with values 0-255
- Includes gamma correction and intensity falloff near vision limits

**Example:**
```javascript
// Map a frequency ratio to a color
const ratio = frequency / maxFrequency;  // 0-1
const wavelength = visSpect01ToWavelength(ratio);
const [r, g, b] = wavelengthToRGB(wavelength, amplitude);
ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
```

### FFT Visualizer (`js/audiomotion-analyzer.js`)

```javascript
import AudioMotionAnalyzer from './audiomotion-analyzer.js';
```

#### `new AudioMotionAnalyzer(container, options)`
Creates an FFT spectrum analyzer visualization. Uses the [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer) library.

**Options:**
- `audioCtx` - The AudioContext to use
- `connectSpeakers` - Whether to connect to speakers (set `false` if routing manually)
- `mode` - Display mode (0 = discrete bars, 1 = line/area, etc.)
- `fftSize` - FFT size (power of 2, higher = more frequency resolution)
- `minFreq` / `maxFreq` - Frequency range to display
- `height` / `width` - Visualization dimensions
- `barSpace` - Space between bars (0-1)
- `weightingFilter` - Frequency weighting ("D", "A", "B", "C", or "none")
- `peakLine` - Show peak line
- `showScaleX` / `showScaleY` - Show frequency/amplitude scales

**Methods:**
- `connectInput(audioNode)` - Connect an audio node to the analyzer
- `destroy()` - Clean up (call in cleanup function)

**Example:**
```javascript
// Create analyzer in a container div
const audioMotion = new AudioMotionAnalyzer(
  document.getElementById('mySlide_fft'),
  {
    audioCtx: ctx,
    connectSpeakers: false,
    mode: 1,
    fftSize: 16384,
    maxFreq: 1000,
    minFreq: 50,
    height: window.innerHeight * 0.9,
    width: window.innerWidth * 0.9,
    barSpace: 0.6,
    weightingFilter: "D",
    peakLine: true,
    showScaleX: true,
    showScaleY: true,
  }
);

// Connect audio source (e.g., gain node)
audioMotion.connectInput(gain);

// Cleanup
return () => {
  audioMotion.destroy();
};
```
