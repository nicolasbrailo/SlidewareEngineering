import * as slideDemosIndex from './slideDemos.js';

// highlight.js seems to automagically start, but if it doesnt:
// hljs.initHighlightingOnLoad();

// Capture Tab key events before impress.js sees them
// This prevents Alt+Tab from triggering slide changes (browser fires keyup on refocus). No one uses tab to navigate anyway.
document.addEventListener('keyup', (evt) => {
  if (evt.key === 'Tab') {
    evt.stopImmediatePropagation();
  }
}, true);

let slideDemoCleanup = null;
async function initSlideDemo(slideTitle) {
  if (slideDemosIndex[slideTitle]) {
    console.log("Init demos for", slideTitle);
    window.audioContext = new (window.AudioContext || webkitAudioContext)();
    slideDemoCleanup = await slideDemosIndex[slideTitle](audioContext);
  }
}

function cleanupSlideDemo(slideTitle) {
  if (slideDemoCleanup) {
    console.log("Cleanup state for", slideTitle);
    slideDemoCleanup();
    slideDemoCleanup = null;
  }
}

// Prevent touch events on slide controls from propagating to impress.js in mobile landscape
// In mobile, trying to interact with demos' sliders/buttons will fight against impress.js slide handling, so
// without this moving a range will try to move to the next slide
function setupMobileTouchHandlers() {
  const controls = document.querySelectorAll('.slide button, .slide input, .slide select, .slide label');
  const mobileQuery = window.matchMedia('(orientation: landscape) and (max-height: 500px)');

  const stopPropagation = (e) => {
    if (mobileQuery.matches) {
      e.stopPropagation();
    }
  };

  controls.forEach(el => {
    el.addEventListener('touchstart', stopPropagation, { passive: true });
    el.addEventListener('touchmove', stopPropagation, { passive: true });
    el.addEventListener('touchend', stopPropagation, { passive: true });
  });
}

// Create and show the click-to-start overlay
function createStartOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'start-overlay';
  overlay.innerHTML = `
    <div class="start-overlay-content">
      <h1>Click to Start</h1>
      <p>User interaction required for audio</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Initialize the presentation after user interaction
function initPresentation() {
  window.presentationManager = impress();
  window.presentationManager.init();
  initSlideNo(window.presentationManager);
}

window.addEventListener('load', async () => {
  setupMobileTouchHandlers();
  window.currentSlideTitle = null;
  document.addEventListener('impress:stepenter', async (evt) => {
    window.currentSlideTitle = evt.target.id;
    initSlideDemo(window.currentSlideTitle);
  });
  document.addEventListener('impress:stepleave', async (evt) => {
    cleanupSlideDemo(window.currentSlideTitle);
    window.currentSlideTitle = null;
  });

  // Try mic first (permission dialog counts as user interaction)
  // Fall back to click overlay if mic unavailable or denied
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop()); // Release mic immediately
    initPresentation();
    return;
  } catch (e) {
    // User denied, unavailable (non-HTTPS), or error - fall through to overlay
    console.log('Mic access denied or unavailable, using click-to-start overlay');
  }

  // Show overlay and wait for user interaction to enable AudioContext
  const overlay = createStartOverlay();
  const startPresentation = () => {
    overlay.classList.add('hiding');
    setTimeout(() => overlay.remove(), 300);
    initPresentation();
  };

  overlay.addEventListener('click', startPresentation, { once: true });
  overlay.addEventListener('touchend', startPresentation, { once: true });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      startPresentation();
    }
  }, { once: true });
});
