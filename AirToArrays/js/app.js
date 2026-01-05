import { getUserMic } from './audioHelpers.js';
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

window.addEventListener('load', async () => {
  window.currentSlideTitle = null;
  document.addEventListener('impress:stepenter', async (evt) => {
    window.currentSlideTitle = evt.target.id;
    initSlideDemo(window.currentSlideTitle);
  });
  document.addEventListener('impress:stepleave', async (evt) => {
    cleanupSlideDemo(window.currentSlideTitle);
    window.currentSlideTitle = null;
  });

  // Request user mic to ensure user interaction, which also means we can create audio ctx
  getUserMic().then(_ => {
    window.presentationManager = impress();
    window.presentationManager.init();
    // Show slide number
    initSlideNo(window.presentationManager);
  });
});
