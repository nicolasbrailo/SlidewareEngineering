// highlight.js seems to automagically start, but if it doesnt:
// hljs.initHighlightingOnLoad();

// Capture Tab key events before impress.js sees them
// This prevents Alt+Tab from triggering slide changes (browser fires keyup on refocus). No one uses tab to navigate anyway.
document.addEventListener('keyup', (evt) => {
  if (evt.key === 'Tab') {
    evt.stopImmediatePropagation();
  }
}, true);

window.addEventListener('load', async () => {
  let currentSlide = null;
  document.addEventListener('impress:stepenter', async (evt) => {
    currentSlide = evt.target.id;
  });

  window.presentationManager = impress();
  window.presentationManager.init();
  initSlideNo(window.presentationManager);
});
