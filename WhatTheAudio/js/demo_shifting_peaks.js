import {exp01ToF, fromDb, getUserMic, linToDb, visSpect01ToWavelength, visSpect01ToRGB } from './audioHelpers.js';

import AudioMotionAnalyzer from './3p/audiomotion-analyzer.js'

export async function demo_shifting_peaks(ctx) {
  // Create an osc to be rendered
  const render_osc = ctx.createOscillator();
  const render_gain = ctx.createGain();

  // And a fake one we don't render, so we can mix in with mic but have no echo
  const noRender_osc = ctx.createOscillator();
  const noRender_gain = ctx.createGain();
  let audioMotion = new AudioMotionAnalyzer(
                        document.getElementById('shifting_peaks_graph_container'),
                        {
                          audioCtx: ctx,
                          connectSpeakers: false, // Implicit sink to speakers
                          //noteLabels: true,
                          maxFreq: 16000,
                          minFreq: 30,
                          height: window.innerHeight - 200,
                          mode: 1,
                          barSpace: .6,
                          ledBars: true,
                          weightingFilter: "D",
                        }
                      );

  // Add a mic and a mixer for the analyzer
  const micGain = ctx.createGain();
  let mic = ctx.createMediaStreamSource(await getUserMic());

  // Configure
  render_osc.frequency.setValueAtTime(0, 0, 0);
  render_gain.gain.setValueAtTime(0.1, 0);

  noRender_osc.frequency.setValueAtTime(0, 0, 0);
  noRender_gain.gain.setValueAtTime(0.1, 0);

  micGain.gain.setValueAtTime(2, 0);

  // Build graphs
  render_osc.connect(render_gain);
  render_gain.connect(ctx.destination);
  render_osc.start();

  mic.connect(micGain);
  micGain.connect(noRender_gain);
  noRender_osc.connect(noRender_gain);
  audioMotion.connectInput(noRender_gain);
  noRender_osc.start();

  const onSliderChange = (e) => {
    const p = e.target.value / 100;

    const soundF = exp01ToF(p);
    render_osc.frequency.setTargetAtTime(soundF, 0, 0);
    noRender_osc.frequency.setTargetAtTime(soundF, 0, 0);

    $('#shifting_peaks_slider_f_lbl').text(`Light wavelength: ${Math.round(visSpect01ToWavelength(p))} [nanometers] ; Sound frequency: ${Math.round(soundF)} Hertz`);

    const bg = visSpect01ToRGB(p);
    var canvas = $('#shifting_peaks_canvas')[0];
    var canvasCtx = canvas.getContext('2d');
    canvasCtx.fillStyle = "rgb("+bg[0]+','+bg[1]+','+bg[2]+")";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.stroke();
  };
  $('#shifting_peaks_slider')[0].addEventListener('input', onSliderChange);

  onSliderChange({"target": {"value": 5}});

  return () => {
    audioMotion.destroy();
    audioMotion = null;
    noRender_osc.disconnect();
    noRender_gain.disconnect();
    render_osc.disconnect();
    render_gain.disconnect();
    mic.disconnect();
    micGain.disconnect();
  };
}
