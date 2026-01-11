import { mkPlot } from "./canvasHelpers.js";

export function mkEnvelopePlot(canvas, ctx, config={}) {
  const cfg = {
    historySeconds: 6,
    yRange: 1,
    decayAlpha: 0.0001,
    attackAlpha: 0.05,
    lpfCutoff: 1000,
    smoothingFrames: 2,
    trackPeak: false,
    trackRms: true,
  };

  const plot = mkPlot(canvas, {
    padding: { top: 10, right: 10, bottom: 20, left: 40 },
    xRange: [-cfg.historySeconds, 0],
    yRange: [-cfg.yRange, cfg.yRange],
  });

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = cfg.lpfCutoff;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;

  const envelopeTracker = (positive, useRms) => {
    const fps = 60; // Doesn't need to be exact, it will just change how quickly the graph scrolls
    const bufferSize = Math.ceil(cfg.historySeconds * fps);
    const envelopeBuff = new Array(bufferSize).fill(0);
    let lastTime = performance.now();
    let lastVal = 0;

    return {
      onFrame: (samples) => {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        // Peak works well for real signal, but raises the floor noise too much
        let peak = samples[0];
        let ss = 0;
        for (let i = 0; i < samples.length; i++) {
          if (positive && samples[i] > peak) peak = samples[i];
          if (!positive && samples[i] < peak) peak = samples[i];
          ss += samples[i] * samples[i];
        }

        if (useRms) {
          lastVal = (positive?1:-1) * Math.sqrt(ss / samples.length);
        } else {
          if (positive && peak > lastVal) {
            lastVal = cfg.attackAlpha * lastVal + (1 - cfg.attackAlpha) * peak;
          } else if (positive && peak <= lastVal) {
            lastVal *= Math.pow(cfg.decayAlpha, dt);
          } else if (!positive && peak < lastVal) {
            lastVal = cfg.attackAlpha * lastVal + (1 - cfg.attackAlpha) * peak;
          } else if (!positive && peak >= lastVal) {
            lastVal *= Math.pow(cfg.decayAlpha, dt);
          }
        }

        envelopeBuff.shift();
        envelopeBuff.push(lastVal);

        const pts = [];
        for (let i=0; i < envelopeBuff.length; ++i) {
          let smoothed = envelopeBuff[i];
          if (i > cfg.smoothingFrames && cfg.smoothingFrames > 0) {
            for (let j=1; j < cfg.smoothingFrames; ++j) {
              smoothed += envelopeBuff[i-j];
            }
            smoothed /= cfg.smoothingFrames;
          }
          const t = ((i - bufferSize) / fps);
          pts.push([t, smoothed]);
        }
        return pts;
      },
    };
  };

  const envP = envelopeTracker(true, true);
  const envN = envelopeTracker(false, true);
  const envPr = envelopeTracker(true, false);
  const envNr = envelopeTracker(false, false);
  let animationFrameId = null;
  const timedomainData = new Float32Array(analyser.fftSize);
  const draw = () => {
    plot.clear();
    plot.drawAxes();
    plot.drawYTicks(11, (v) => v.toFixed(2));
    plot.drawHLine(0, '#ccc', false, .5);

    analyser.getFloatTimeDomainData(timedomainData);
    if (cfg.trackPeak) {
      plot.drawLine(envP.onFrame(timedomainData), '#00c', 1);
      plot.drawLine(envN.onFrame(timedomainData), '#00c', 1);
    }
    if (cfg.trackRms) {
      plot.drawLine(envPr.onFrame(timedomainData), '#c00', 1);
      plot.drawLine(envNr.onFrame(timedomainData), '#c00', 1);
    }

    animationFrameId = requestAnimationFrame(draw);
  };

  return {
    connectInput: (src) => {
      src.connect(lpf);
      lpf.connect(analyser);
      draw();
    },
    stop: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      try { lpf.disconnect(); } catch (e) {}
      try { analyser.disconnect(); } catch (e) {}
    }
  };
}


