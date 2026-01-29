import { mkPlot } from "./canvasHelpers.js";

/**
 * This is only useful to show a single frame in real time, not a sliding window of frames.
 */
export function mkInstantTimeDomainPlot(canvas, ctx, cfg={}) {
  // TODO: Make configurable the fftSize, the samples to display, the yRange
  const displaySamples = 1024;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  const timedomainData = new Float32Array(analyser.fftSize);
  let animationFrameId = null;

  /* Extract a displayLen sized slice of samples that start on a zero-crossing. This will make rendering more
   * stable for timedomain data (it won't drift quite as much) */
  function alignToZeroXing(samples, displayLen) {
    const searchLimit = samples.length - displayLen;
    let triggerIndex = 0;
    for (let i = 1; i < searchLimit; i++) {
      if (samples[i - 1] <= 0 && samples[i] > 0) {
        triggerIndex = i;
        break;
      }
    }
    const points = [];
    for (let i = 0; i < displayLen; i++) {
      points.push([i, samples[triggerIndex + i]]);
    }
    return points;
  };

  const draw = () => {
    analyser.getFloatTimeDomainData(timedomainData);
    const plot = mkPlot(canvas, {
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      xRange: [0, displaySamples - 1],
      yRange: [-(cfg.yRange || .15), (cfg.yRange || .15)],
    });

    plot.drawHLine(0, '#888');
    plot.drawLine(alignToZeroXing(timedomainData, displaySamples), '#0c0', 1.5);

    // Request next
    animationFrameId = requestAnimationFrame(draw);
  };

  return {
    connectInput: (src) => {
      src.connect(analyser);
      draw();
    },

    stop: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      try { analyser.disconnect(); } catch (e) {}
    }
  };
}
