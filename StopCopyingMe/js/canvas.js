export {
    drawAmplitudeNotches,
    drawDbfsYAxis,
    drawWave,
    mkPlot,
  } from "./canvasHelpers.js";

export { mkCustomFrameEditor } from "./canvasFrameEdit.js";
export { mkEnvelopePlot } from "./canvasEnvelope.js";
export { mkInstantTimeDomainPlot } from "./canvasTimedomainPlot.js";
export { mkSpectrogramPlot } from "./canvasSpectrogram.js";

export function drawSineWave(canvas, frequency, amplitude) {
  // 480 is somewhat arbitrary, it works fine for my resolution to plot a few cycles at 400Hz
  const sin = (a, i) => a*Math.sin(i*frequency/480);
  return drawWave(canvas, frequency, amplitude, sin);
}

export function drawSawtoothWave(canvas, frequency, amplitude) {
  const cb = (a, i) => ((i*frequency/2000*Math.PI) % (2*a)) - a;
  return drawWave(canvas, frequency, amplitude, cb);
}

export function drawTriangleWave(canvas, frequency, amplitude) {
  const cb = (a, i) => 2*a*Math.asin(Math.sin(i*2*Math.PI / 1200 * frequency)) /  Math.PI;
  return drawWave(canvas, frequency, amplitude, cb);
}

export function drawSquareWave(canvas, frequency, amplitude) {
  const cb = (a, i) => a*(Math.sin(i*frequency/480) > 0? 1 : -1);
  return drawWave(canvas, frequency, amplitude, cb);
}

/**
 Docs @ https://audiomotion.dev/#/?id=live-code-examples
 */
import AudioMotionAnalyzer from './canvasAudiomotionFFT.js'
export function mkAudioMotionAnalyzer(divId, ctx, cfg) {
  const el = document.getElementById(divId);
  if (!el || el.tagName !== "DIV") {
    console.error(`${divId} doesn't exist or isn't a div`);
    return null;
  }
  return new AudioMotionAnalyzer(
    el,
    {
      audioCtx: ctx,
      connectSpeakers: false,
      mode: 1,
      fftSize: 16384,
      maxFreq: 10000,
      minFreq: 50,
      height: window.innerHeight * 0.9,
      width: window.innerWidth * 0.9,
      barSpace: 0.6,
      weightingFilter: "D",
      peakLine: true,
      frequencyScale: "mel",
      showScaleX: true,
      showScaleY: true,
      ...cfg
    }
  );
}

