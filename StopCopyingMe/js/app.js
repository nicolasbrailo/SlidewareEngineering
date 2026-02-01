import { getUserMic } from './noisy.js';
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
  window.currentSlideTitle = null;
  document.addEventListener('impress:stepenter', async (evt) => {
    const currentSlideTitle = evt.target.id;
    initSlideDemo(currentSlideTitle);
  });
  document.addEventListener('impress:stepleave', async (evt) => {
    cleanupSlideDemo();
  });

  // Request user mic to ensure user interaction, which also means we can create audio ctx
  try {
    await getUserMic();
  } catch (x) {
    console.log("getUserMic failed, demos will break:", x);
  }

  window.presentationManager = impress();
  window.presentationManager.init();
  // Show slide number
  initSlideNo(window.presentationManager);
});
