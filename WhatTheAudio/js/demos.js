import {exp01ToF, fromDb, linToDb, getUserMic, UserMicRecorder, visSpect01ToRGB, webAudioFrameRMS } from './audioHelpers.js';
import {demo_shifting_peaks} from './demo_shifting_peaks.js';
import {demo_waveforms} from './waveforms.js';

import {VHSEffect} from './nodes/vhs.js';
import {PSTNizer} from './nodes/pstnizer.js';
import {Underwater} from './nodes/underwater.js';
import {createSpectrogramRenderer} from './nodes/spectrogramToCanvas.js';

import AudioMotionAnalyzer from './3p/audiomotion-analyzer.js'

export async function is_this_on(ctx) {
  let mic = ctx.createMediaStreamSource(await getUserMic());
  mic.connect(ctx.destination);
  return () => {
    mic.disconnect();
    mic = null;
  };
}

export async function shifting_peaks(ctx) {
  return demo_shifting_peaks(ctx);
}

export async function fft_3d(ctx) {
  let mic = ctx.createMediaStreamSource(await getUserMic());

  const plot = createSpectrogramRenderer(ctx, 'fft_3d_canvas', {fftSize: 2048, timeSliceWidthPx: 5});
  plot.connectInput(mic);

  return () => {
    plot.stop();
    mic.disconnect();
    mic = null;
  };
}


export async function waveforms(ctx) {
  return demo_waveforms(ctx);
}

export async function hearing_colors(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.setValueAtTime(0, 0, 0);
  gain.gain.setValueAtTime(0.1, 0);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();

  $('#hearing_colors_slider')[0].addEventListener('input', (e) => {
    const p = e.target.value / 100;

    const soundF = exp01ToF(p);
    osc.frequency.setTargetAtTime(soundF, 0, 0);

    const bg = visSpect01ToRGB(p);
    var canvas = $('#hearing_colors_canvas')[0];
    var canvasCtx = canvas.getContext('2d');
    canvasCtx.fillStyle = "rgb("+bg[0]+','+bg[1]+','+bg[2]+")";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.stroke();
  });

  return () => {
    osc.disconnect();
    gain.disconnect();
  };
}

export async function every_sample_counts(ctx) {
  function linkMediaControls(primary, secondary) {
    const timeSync = () => { secondary.currentTime = primary.currentTime;  };
    primary.addEventListener('seeking', timeSync);
    primary.addEventListener('ended', timeSync);
    primary.addEventListener('play', _ => { timeSync(); secondary.play(); });
    primary.addEventListener('pause', _ => { timeSync(); secondary.pause(); });
  }

  const vid = $('#every_sample_counts_video')[0];
  const aud = $('#every_sample_counts_audio')[0];
  linkMediaControls(vid, aud);

  const src = ctx.createMediaElementSource(aud);
  const frameDropper = new AudioWorkletNode(ctx, 'framedropper');
  frameDropper.parameters.get('drop_n').setValueAtTime(0, 0);
  frameDropper.parameters.get('group_size').setValueAtTime(24, 0);

  src.connect(frameDropper);
  frameDropper.connect(ctx.destination);

  for (const fps of [24, 15, 10, 5]) {
    $(`#every_sample_counts_${fps}`)[0].addEventListener('click', () => {
      const drop = 24 - fps;
      frameDropper.parameters.get('drop_n').setValueAtTime(drop, 0);
    });
  }

  return () => {
    vid.pause();
    aud.pause();
    src.disconnect();
    frameDropper.disconnect();
  };
}

export async function lossily_hear_yourself(ctx) {
  const recorder = new UserMicRecorder(ctx);

  const frameDropper = new AudioWorkletNode(ctx, 'framedropper');
  frameDropper.parameters.get('drop_n').setValueAtTime(0, 0);
  frameDropper.parameters.get('group_size').setValueAtTime(100, 0);

  recorder.connect(frameDropper);
  frameDropper.connect(ctx.destination);

  $('#lossily_hear_yourself_rec')[0].addEventListener('click', async () => {
    if (!recorder.isRecording()) {
      await recorder.record(await getUserMic());
    } else {
      recorder.stopRecording();
    }
  });

  $('#lossily_hear_yourself_play')[0].addEventListener('click', () => {
    recorder.togglePlayLoop();
  });

  $('#lossily_hear_yourself_slider')[0].addEventListener('input', (e) => {
    frameDropper.parameters.get('drop_n').setValueAtTime(e.target.value, 0);
  });

  return () => {
    recorder.disconnect();
    frameDropper.disconnect();
  };
}

export async function effects(ctx) {
  let mic_on = true;
  let mic = ctx.createMediaStreamSource(await getUserMic());
  const mic_gain = ctx.createGain();
  const srcs = [ctx.createMediaElementSource($('#effects_music1')[0]),
                ctx.createMediaElementSource($('#effects_music2')[0]),
                ctx.createMediaElementSource($('#effects_voice1')[0]),
                mic_gain];

  const src_bus = ctx.createGain();
  src_bus.gain.setValueAtTime(1, ctx.currentTime);

  let audioMotion = null;

  const mkNewSpec = () => {
    return new AudioMotionAnalyzer(
                          document.getElementById('effects_graph_container'),
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
  };

  const vhs = new VHSEffect(ctx);
  const pstnizer = new PSTNizer(ctx);
  const underwater = new Underwater(ctx);

  const applyEffectNone = () => {
    mic.connect(mic_gain);
    for (let s of srcs) {
      s.connect(src_bus);
    }
    audioMotion = mkNewSpec();
    audioMotion.connectInput(src_bus);
  };

  const clearAll = () => {
    audioMotion.destroy();
    vhs.disconnect();
    pstnizer.disconnect();
    underwater.disconnect();
    src_bus.disconnect();
    for (let s of srcs) {
      s.disconnect();
    }
  };

  const applyEffect = (e) => {
    clearAll();
    mic.connect(mic_gain);
    for (let s of srcs) {
      s.connect(src_bus);
    }
    e.connectInput(src_bus);
    audioMotion = mkNewSpec();
    audioMotion.connectInput(e.getOutput());
  };

  $('#effects_name').change(() => {
    const effect = $('#effects_name').find(":selected").val();
    if (effect == "none") {
      applyEffectNone();
    } else if (effect == "vhs") {
      applyEffect(vhs);
    } else if (effect == "pstn") {
      applyEffect(pstnizer);
    } else if (effect == "underwater") {
      applyEffect(underwater);
    } else {
      console.error("Unknown effect", effect);
    }
  });

  $('#effects_mic_toggle')[0].addEventListener('click', () => {
    mic_on = ! mic_on;
    $('#effects_mic_toggle').text(mic_on? "Disable mic" : "Enable mic");
    mic_gain.gain.setValueAtTime(mic_on? 1 : 0, ctx.currentTime);
  });

  applyEffectNone();
  return () => {
    clearAll();
    mic.disconnect();
    mic = null;
  };
}

export async function echo_echo_echo_echo(ctx) {
  let mic = ctx.createMediaStreamSource(await getUserMic());
  const micGain = ctx.createGain();
  const micInfo = ctx.createAnalyser();
  const aecAttenuation = ctx.createGain();
  const delay = ctx.createDelay(/*maxDelaySecs=*/5);

  micInfo.fftSize = 2048;
  const signal = new Uint8Array(micInfo.fftSize);

  let attenuationNow = 20;
  let delayNow = 500;

  // Value not-very-carefully tuned to get an RMS similar to a webrtc call in a MacPro
  let micGainNow = 9;

  const setGainsAndDelay = () => {
    micGain.gain.setValueAtTime(1+fromDb(micGainNow), ctx.currentTime);
    aecAttenuation.gain.setValueAtTime(1/fromDb(attenuationNow), ctx.currentTime);
    delay.delayTime.setValueAtTime(delayNow/1000, ctx.currentTime);

    micInfo.getByteTimeDomainData(signal);
    const rms = linToDb(webAudioFrameRMS(signal));
    console.log("Echo delay=", delayNow, "ms, echo attenuation=", attenuationNow, "dB, mic gain=", micGainNow, "mic rms=", rms);

    $('#echo_echo_echo_echo_attenuation_lbl').text("Echo attenuation: " + attenuationNow + " dB");
    $('#echo_echo_echo_echo_delay_lbl').text("Echo delay: " + delayNow + " ms");
    $('#echo_echo_echo_echo_mic_gain_lbl').text("Mic gain: " + micGainNow + " dB");

    // These should be safe because they don't generate an event
    $('#echo_echo_echo_echo_attenuation').val(attenuationNow);
    $('#echo_echo_echo_echo_delay').val(delayNow);
    $('#echo_echo_echo_echo_mic_gain').val(micGainNow);
  }

  setGainsAndDelay();

  mic.connect(micGain);
  micGain.connect(micInfo);
  micInfo.connect(delay);
  delay.connect(aecAttenuation);
  aecAttenuation.connect(ctx.destination);

  $('#echo_echo_echo_echo_attenuation')[0].addEventListener('input', (e) => {
    attenuationNow = e.target.value;
    setGainsAndDelay();
  });

  $('#echo_echo_echo_echo_delay')[0].addEventListener('input', (e) => {
    delayNow = e.target.value;
    setGainsAndDelay();
  });

  $('#echo_echo_echo_echo_mic_gain')[0].addEventListener('input', (e) => {
    micGainNow = e.target.value;
    setGainsAndDelay();
  });

  return () => {
    mic.disconnect();
    mic = null;
  };
}

export async function experiment(ctx) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(400, 0, 0);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.1, 0);

  const bus = ctx.createGain();
  bus.gain.setValueAtTime(1, 0);

  let mic = ctx.createMediaStreamSource(await getUserMic());
  const testSrc = ctx.createMediaElementSource(document.getElementById('experiment_voice'));

  const exp = new AudioWorkletNode(ctx, 'experiment');
  exp.parameters.get('resampleFactor').setValueAtTime(1.8, 0);

  exp.port.onmessage = console.log;
  const statsIntervalId = setInterval(() => {
    exp.port.postMessage('stats');
  }, 1000);

  osc.connect(oscGain);
  //oscGain.connect(bus);
  mic.connect(bus);
  testSrc.connect(bus);
  bus.connect(exp);
  exp.connect(ctx.destination);

  osc.start();

  return () => {
    clearInterval(statsIntervalId);
    mic.disconnect();
    testSrc.disconnect();
    exp.disconnect();
    mic = null;
  };
}
