export class MonoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.procStats = {
      framesProcessed: 0,
      frameDropped_badInputCount: 0,
      frameDropped_badOutputCount: 0,
      frameDropped_inputNotMono: 0,
      frameDropped_outputNotMono: 0,
      frameDropped_sampleCountMismatch: 0,
      frameSizeInSamples: 0,
      frameSizeChanges: 0,
    };
  }

  onMessage(msg) {
    if (msg.data == 'stats') {
      console.log(this.procStats);
    } else {
      console.log(`Unknown msg' ${msg}`);
    }
  }

  process(inputs, outputs, parameters) {
    if (inputs.length != 1) {
      this.procStats.frameDropped_badInputCount++;
      return true;
    }

    if (inputs.length != outputs.length) {
      this.procStats.frameDropped_badOutputCount++;
      return true;
    }

    if (inputs[0].length != 1) {
      this.procStats.frameDropped_inputNotMono++;
      return true;
    }

    if (inputs[0].length != outputs[0].length) {
      this.procStats.frameDropped_outputNotMono++;
      return true;
    }

    if (inputs[0][0].length != outputs[0][0].length) {
      this.procStats.frameDropped_sampleCountMismatch++;
      return true;
    }

    const input = inputs[0][0];
    const output = outputs[0][0];

    if (input.length != this.procStats.frameSizeInSamples) {
      this.procStats.frameSizeInSamples = input.length;
      this.procStats.frameSizeChanges++;
      this.onFrameSizeChanged(this.procStats.frameSizeInSamples);
    }

    const ret = this.monoProcess(input.length, input, output);
    this.procStats.framesProcessed++;
    return ret;
  }
}
