// highlight.js seems to automagically start, but if it doesnt:
// hljs.initHighlightingOnLoad();

// Capture Tab key events before impress.js sees them
// This prevents Alt+Tab from triggering slide changes (browser fires keyup on refocus). No one uses tab to navigate anyway.
document.addEventListener('keyup', (evt) => {
  if (evt.key === 'Tab') {
    evt.stopImmediatePropagation();
  }
}, true);

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
  let currentSlide = null;
  document.addEventListener('impress:stepenter', async (evt) => {
    currentSlide = evt.target.id;
  });

  window.presentationManager = impress();
  window.presentationManager.init();
  initSlideNo(window.presentationManager);
});
