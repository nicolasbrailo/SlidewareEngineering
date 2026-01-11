/* Records from an AudioNode for a period of time, returns recorded buffer */
export function mkRecorder(ctx) {
  let isRecording = false;
  let player = null;
  let recordedBuffer = null;

  const streamDest = ctx.createMediaStreamDestination();
  const mediaRecorder = new MediaRecorder(streamDest.stream);
  const outputBus = ctx.createGain();

  let connectedInput = null;
  const connectInput = (node) => {
    connectedInput = node;
    connectedInput.connect(streamDest);
  };

  const record = async (audioNode = null) => {
    if (player) {
      console.error("Recorder refuses to record while playing");
      return;
    }
    if (isRecording) {
      console.error("Recording in progress, refusing to start new one");
      return;
    }
    if (audioNode) connectInput(audioNode);
    if (!connectedInput) {
      console.error("No input connected, nothing to record");
      return;
    }
    isRecording = true;
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      // Never disconnect
      // connectedInput.disconnect(streamDest);
      isRecording = false;
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      recordedBuffer = await ctx.decodeAudioData(arrayBuffer);
    };
    mediaRecorder.start();
  }

  return {
    get isRecording() { return isRecording; },
    get isPlaying() { return !!player; },
    record,
    recordWithTimeout: (audioNode, timeoutMs) => {
      record(audioNode);
      setTimeout(mediaRecorder.stop, timeoutMs);
    },
    recordStop: () => mediaRecorder.stop(),
    getRecordedBuffer: () => recordedBuffer,
    getOutput: () => outputBus,
    connectInput,
    playToggle: (onPlaying=null, onStop=null) => {
      if (player) {
        player.stop();
        player = null;
        onStop && onStop();
      } else {
        if (!recordedBuffer) {
          console.error("No recording, nothing to play");
          onStop && onStop();
          return;
        }
        player = ctx.createBufferSource();
        player.buffer = recordedBuffer;
        player.onended = () => { player = false; onStop && onStop(); };
        player.connect(outputBus);
        player.start();
        onPlaying && onPlaying();
      }
    },
  };
}

