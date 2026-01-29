# impress.js Presentation

## Project Structure
- `index.html` - Main presentation file, slides go here
- `js/slideDemos.js` - Interactive demo functions for slides
- `js/canvas.js` - Canvas/plotting utilities
- `js/audioHelpers.js` - Audio and Web Audio API utilities (oscillators, microphone)
- `js/app.js` - Application entry point
- `css/` - Stylesheets
- `img/` - Images
- `extdeps/` - External dependencies such as impress.js

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

When a slide loads, the app looks for an exported function matching the slide ID. The function should return an object with methods start, stop and cleanup. start and stop will automatically bind to a button, if it exists. cleanup will be called when the slide is unloaded.

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
    start: () => { /* invoked when the user wants to start a demo*/ },
    stop: () => { /* invoked when the user wants to stop a demo*/ },
    cleanup: () => { /* invoked when the slide is unloaded */ },
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

## Audio Processors

### `js/noisy-processors/noisyFauxEC.js`

AudioWorklet processor for faux echo cancellation demos. Has multiple strategies selectable via `setMode` message.

**Strategies:**
- `passthrough` - Passes mic input through unchanged
- `silenceMic` - Outputs silence (mutes mic)
- `testTone` - Adds 880Hz test tone to mic input
- `naiveSubtract` - Subtracts far-end from near-end without delay compensation
- `halfDuplex` - Gates mic when far-end signal exceeds threshold (configurable attack/decay/threshold)
- `timeAlignedSubtract` - Subtracts far-end with cross-correlation based delay estimation

**Configuration:**
- Send `getDefaultConfigs` message to receive default configs for all strategies (returns `{halfDuplex, xCorr, rir, nlms}`)
- Send `setConfigs` with `{mode, timeAligned, halfDuplex, rir, nlms}` to configure all strategies at once
- Send `setMode` with strategy name to switch strategies
- Send `nlms_reset` to reset the LMS filter coefficients
- Send `rir_measure` to trigger a new RIR measurement

**Classes:**
- `XCorrHelper` - Cross-correlation delay estimator with configurable parameters
- `HalfDuplexStrategy` - Level-based mic gating with attack/decay envelope
- `TimeAlignedSubtractStrategy` - Uses XCorrHelper to find delay, then subtracts delayed far-end

