import {exp01ToF, fromDb, getUserMic, linToDb, visSpect01ToWavelength, visSpect01ToRGB } from './audioHelpers.js';

import AudioMotionAnalyzer from './3p/audiomotion-analyzer.js'

export async function demo_waveforms(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  let audioMotion = new AudioMotionAnalyzer(
                        document.getElementById('waveforms_graph_container'),
                        {
                          audioCtx: ctx,
                          connectSpeakers: true, // Implicit sink to speakers
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

  osc.frequency.setValueAtTime(0, 0, 0);
  gain.gain.setValueAtTime(0.1, 0);

  osc.connect(gain);
  audioMotion.connectInput(gain);
  osc.start();

  const onSliderChange = (e) => {
    const p = e.target.value / 100;

    const soundF = exp01ToF(p);
    osc.frequency.setTargetAtTime(soundF, 0, 0);
    osc.frequency.setTargetAtTime(soundF, 0, 0);

    $('#waveforms_slider_f_lbl').text(`Light wavelength: ${Math.round(visSpect01ToWavelength(p))} [nanometers] ; Sound frequency: ${Math.round(soundF)} Hertz`);

    const bg = visSpect01ToRGB(p);
    var canvas = $('#waveforms_canvas')[0];
    var canvasCtx = canvas.getContext('2d');
    canvasCtx.fillStyle = "rgb("+bg[0]+','+bg[1]+','+bg[2]+")";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.stroke();
  };
  $('#waveforms_slider')[0].addEventListener('input', onSliderChange);

  $('#waveforms_name').change(() => {
    const shape = $('#waveforms_name').find(":selected").val();
    osc.type = shape;
  });

  onSliderChange({"target": {"value": 5}});

  return () => {
    audioMotion.destroy();
    audioMotion = null;
    osc.disconnect();
    gain.disconnect();
  };
}

