import * as demos from './demos.js';
import { getUserMic } from './audioHelpers.js';

async function initDemos(currentSlide) {
  window.audioContext = new (window.AudioContext || webkitAudioContext)();

  // Load extra modules
  await audioContext.audioWorklet.addModule('js/worklet_nodes/framedropper.js');
  await audioContext.audioWorklet.addModule('js/worklet_nodes/pinknoise.js');
  await audioContext.audioWorklet.addModule('js/worklet_nodes/bitwidth.js');
  await audioContext.audioWorklet.addModule('js/worklet_nodes/experiment.js');
  //await audioContext.audioWorklet.addModule('js/worklet_nodes/experiment2.js');

  // Demo hooks to impress.js
  let cleanup = null;

  document.addEventListener('impress:stepenter', async (evt) => {
    const slideId = evt.target.id;
    if (demos[slideId]) {
      if (cleanup != null) {
        console.error('Previous slide failed to cleanup');
      }

      console.log(`Load demo ${evt.target.id}`);
      cleanup = await demos[slideId](audioContext);
    }
  });

  document.addEventListener('impress:stepleave', () =>{
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

  // Init current demo, if deeplinking
  if (currentSlide && demos[currentSlide]) {
      console.log(`Load deeplinked demo: ${currentSlide}`);
      cleanup = await demos[currentSlide](audioContext);
  }
}

const devMode = true;

window.addEventListener('load', async () => {
  let currentSlide = null;
  document.addEventListener('impress:stepenter', async (evt) => {
    currentSlide = evt.target.id;
  });

  window.presentationManager = impress();
  window.presentationManager.init();

  if (devMode) {
    console.info("DEV MODE ENABLED, AUTO CAPTURE MIC");
    getUserMic().then(_ => {
      initDemos(currentSlide);
      document.getElementById('demos_disabled_msg').style.visibility = 'hidden';
    });
  }

  document.getElementById('demos_enable').addEventListener("click", () => {
    initDemos(currentSlide);
    document.getElementById('demos_disabled_msg').style.visibility = 'hidden';
  });

  document.getElementById('demos_keep_disabled').addEventListener("click", () => {
    document.getElementById('demos_disabled_msg').style.visibility = 'hidden';
  });
});
