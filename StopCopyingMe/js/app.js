import * as slideDemosIndex from './slideDemos.js';

function getImpressMargins() {
  const root = document.getElementById('impress');
  const configWidth = parseFloat(root.dataset.width) || 1920;
  const configHeight = parseFloat(root.dataset.height) || 1080;
  const maxScale = parseFloat(root.dataset.maxScale) || Infinity;
  const minScale = parseFloat(root.dataset.minScale) || 0;

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  // Same logic as impress.js: scale to fit the smaller dimension
  let scale = Math.min(windowWidth / configWidth, windowHeight / configHeight);
  scale = Math.max(minScale, Math.min(maxScale, scale));

  const scaledWidth = configWidth * scale;
  const scaledHeight = configHeight * scale;

  return {
    horizontal: (windowWidth - scaledWidth) / 2,
    vertical: (windowHeight - scaledHeight) / 2,
    scale
  };
}

function checkSideNavMargins() {
  const margins = getImpressMargins();
  const minMarginNeeded = 40; // button width + padding
  const showButtons = margins.horizontal >= minMarginNeeded;
  document.body.classList.toggle('has-side-nav-margins', showButtons);
}

window.addEventListener('resize', checkSideNavMargins);

// highlight.js seems to automagically start, but if it doesnt:
// hljs.initHighlightingOnLoad();

// Capture Tab key events before impress.js sees them
// This prevents Alt+Tab from triggering slide changes (browser fires keyup on refocus). No one uses tab to navigate anyway.
document.addEventListener('keyup', (evt) => {
  if (evt.key === 'Tab') {
    evt.stopImmediatePropagation();
  }
}, true);

let slideRunCtx = null;

async function initSlideDemo(slideTitle) {
  if (slideDemosIndex[slideTitle]) {
    console.log("Init demos for", slideTitle);
    window.audioContext = new (window.AudioContext || webkitAudioContext)();

    // Load all required worklets
    if (slideDemosIndex.workletsToLoad) {
      await Promise.all(slideDemosIndex.workletsToLoad.map(path => audioContext.audioWorklet.addModule(path)));
    }

    slideRunCtx = {
      slideTitle,
      cbs: await slideDemosIndex[slideTitle](audioContext),
      running: false,
      demoToggle: () => {
        slideRunCtx.running = !slideRunCtx.running;
        if (slideRunCtx.running) {
          document.getElementById(`${slideTitle}_demoToggle`).textContent = 'Stop';
          slideRunCtx.cbs.start()
        } else {
          document.getElementById(`${slideTitle}_demoToggle`).textContent = 'Start';
          slideRunCtx.cbs.stop();
        }
      },
    };

    if (document.getElementById(`${slideTitle}_demoToggle`)) {
      document.getElementById(`${slideTitle}_demoToggle`).addEventListener('click', slideRunCtx.demoToggle);
    }
  }
}

function cleanupSlideDemo() {
  if (slideRunCtx) {
    console.log("Cleanup state for", slideRunCtx.slideTitle);
    slideRunCtx.cbs.cleanup();
    if (document.getElementById(`${slideRunCtx.slideTitle}_demoToggle`)) {
      document.getElementById(`${slideRunCtx.slideTitle}_demoToggle`).removeEventListener('click', slideRunCtx);
    }
    slideRunCtx = null;
  }
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

window.addEventListener('load', async () => {
  setupMobileTouchHandlers();
  checkSideNavMargins();
  window.currentSlideTitle = null;
  document.addEventListener('impress:stepenter', async (evt) => {
    const currentSlideTitle = evt.target.id;
    initSlideDemo(currentSlideTitle);
  });
  document.addEventListener('impress:stepleave', async (evt) => {
    cleanupSlideDemo();
  });

  // Try mic first (permission dialog counts as user interaction)
  // Fall back to click overlay if mic unavailable or denied
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop()); // Release mic immediately
    initPresentation();
    return;
  } catch (e) {
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
