export function getUserMic() {
  return navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {autoGainControl: false, echoCancellation: false, noiseSuppression: false},
  });
}

export function exp01ToF(x) {
  const mx = 15000;
  const mn = 50;
  const M = (mx - mn) / 9;
  const C = mn - M;
  return (10**x) * M + C;
}

export function fromDb(n) { return 10**(n/20); }
export function linToDb(n) { return 20*Math.log10(n); }

export function visSpect01ToWavelength(visSpect01) {
  const COLOR_MIN_NM = 390.0;
  const COLOR_MAX_NM = 680.0;

  // Map sound wavelength from 1e7nm 6.6e4nm to visible wavelength (400-700 nm)
  const wavelength = (COLOR_MAX_NM - COLOR_MIN_NM) * (1-visSpect01) + COLOR_MIN_NM;
  return wavelength;
}

export function visSpect01ToRGB(visSpect01, intensity_max=1) {
  const wavelength = visSpect01ToWavelength(visSpect01);

  /**
   * Taken from Earl F. Glynn's web page:
   * <a href="http://www.efg2.com/Lab/ScienceAndEngineering/Spectra.htm">Spectra Lab Report</a>
   */
  const GAMMA = 0.80;
  intensity_max = Math.pow(255 * (intensity_max+0.2), 1.2);
  if (intensity_max < 20) intensity_max = 20;
  if (intensity_max > 255) intensity_max = 255;
  let factor;
  let red, green, blue;

  if((wavelength >= 380) && (wavelength < 440)) {
      red = -(wavelength - 440) / (440 - 380);
      green = 0.0;
      blue = 1.0;
  } else if((wavelength >= 440) && (wavelength < 490)) {
      red = 0.0;
      green = (wavelength - 440) / (490 - 440);
      blue = 1.0;
  } else if((wavelength >= 490) && (wavelength < 510)) {
      red = 0.0;
      green = 1.0;
      blue = -(wavelength - 510) / (510 - 490);
  } else if((wavelength >= 510) && (wavelength < 580)) {
      red = (wavelength - 510) / (580 - 510);
      green = 1.0;
      blue = 0.0;
  } else if((wavelength >= 580) && (wavelength < 645)) {
      red = 1.0;
      green = -(wavelength - 645) / (645 - 580);
      blue = 0.0;
  } else if((wavelength >= 645) && (wavelength < 781)) {
      red = 1.0;
      green = 0.0;
      blue = 0.0;
  } else {
      red = 0.0;
      green = 0.0;
      blue = 0.0;
  }

  // Let the intensity fall off near the vision limits
  if((wavelength >= 380) && (wavelength < 420)) {
      factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
  } else if((wavelength >= 420) && (wavelength < 701)) {
      factor = 1.0;
  } else if((wavelength >= 701) && (wavelength < 781)) {
      factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  } else {
      factor = 0.0;
  }

  // Don't want 0^x = 1 for x <> 0
  const r = red == 0.0 ? 0 : Math.round(intensity_max * Math.pow(red * factor, GAMMA));
  const g = green == 0.0 ? 0 : Math.round(intensity_max * Math.pow(green * factor, GAMMA));
  const b = blue == 0.0 ? 0 : Math.round(intensity_max * Math.pow(blue * factor, GAMMA));
  return [r,g,b];
}

export class UserMicRecorder {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.audioElement = null;
    this.audioSource = null;
    this.mediaRecorder = null;
    this.playing = false;
    this.connectedTo = null;
  }

  connect(tgt) {
    this.connectedTo = tgt;
    if (this.audioSource) {
      this.audioSource.connect(tgt);
    }
  }

  disconnect() {
    this.pause();
    this.connectedTo = null;
    if (this.audioSource) {
      this.audioSource.disconnect();
    }
  }


  isRecording() {
    return (this.mediaRecorder != null);
  }

  record(mic) {
    let recordingCompleteCb = null;
    let recordingFail = null;
    const whenDone = new Promise((resolve, reject) => {
      recordingCompleteCb = resolve;
      recordingFail = reject;
    });

    if (this.mediaRecorder) {
      console.log('Trying to record from an already active recorder');
      recordingFail();
      return whenDone;
    }

    this.pause();

    let chunks = [];
    const mediaRecorder = new MediaRecorder(mic);
    mediaRecorder.ondataavailable = e => { chunks.push(e.data); };
    mediaRecorder.onstop = e => {
      this.mediaRecorder = null;
      mic = null;

      const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
      this.audioElement = new Audio();
      this.audioElement.src = URL.createObjectURL(blob);

      if (this.audioSource) {
        this.audioSource.disconnect();
      }
      this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
      if (this.connectedTo) {
        this.audioSource.connect(this.connectedTo);
      }

      recordingCompleteCb();
    };

    this.mediaRecorder = mediaRecorder;
    this.mediaRecorder.start();
    return whenDone;
  }

  stopRecording() {
    if (!this.mediaRecorder) {
      console.error('Trying to stop an already stopped recorder');
      return;
    }

    this.mediaRecorder.stop();
  }

  _play(loop) {
    if (!this.audioElement) {
      console.log('Trying to play from a MicRecorder without recording first');
      return;
    }

    this.audioElement.loop = loop;
    this.audioElement.addEventListener('ended', () => { this.playing = loop; });
    this.playing = true;
    this.audioElement.play();
  }

  play() {
    return this._play(false);
  }

  pause() {
    if (!this.audioElement) {
      return;
    }

    this.playing = false;
    return this.audioElement.pause();
  }

  togglePlayLoop() {
    this.playing? this.pause() : this._play(true);
  }
}
export function webAudioFrameRMS(frame) {
  let ss = 0;
  for (const v of frame) {
    const f = (parseFloat(v) - 128) / 128;
    ss += f * f;
  }
  return Math.sqrt(ss / frame.length);
}
