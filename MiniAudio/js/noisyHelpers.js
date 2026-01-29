export function fromDb(n){ return 10**(n/20); }
export function toDb(n){ return 20*Math.log10(n); }

export function getUserMic() {
  return navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {autoGainControl: false, echoCancellation: false, noiseSuppression: false},
  });
}

