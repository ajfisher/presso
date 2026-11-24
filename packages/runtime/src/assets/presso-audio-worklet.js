class PressoMicrophone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(sampleRate * 2);
    this.used = 0;
    this.recording = false;
    this.nextLevel = 0;
    this.port.onmessage = ({ data }) => {
      if (data === 'start') this.starting = true;
      if (data === 'stop') {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  flush() {
    if (!this.used) return;
    const samples = this.used === this.buffer.length ? this.buffer : this.buffer.slice(0, this.used);
    this.port.postMessage({ type: 'audio', samples }, [samples.buffer]);
    this.buffer = new Int16Array(sampleRate * 2);
    this.used = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    if (this.starting) {
      this.starting = false;
      this.recording = true;
      this.port.postMessage({ type: 'started', time: currentTime });
    }
    const showLevel = currentFrame >= this.nextLevel;
    if (!showLevel && !this.recording) return true;
    let peak = 0;
    for (let i = 0; i < outputs[0][0].length; i += 1) {
      const sample = input?.[i] ?? 0;
      if (showLevel) peak = Math.max(peak, Math.abs(sample));
      if (!this.recording) continue;
      this.buffer[this.used] = Math.max(-1, Math.min(1, sample)) * 32767;
      this.used += 1;
      if (this.used === this.buffer.length) this.flush();
    }
    if (showLevel) {
      this.port.postMessage({ type: 'level', peak });
      this.nextLevel = currentFrame + sampleRate / 10;
    }
    return true;
  }
}

registerProcessor('presso-microphone', PressoMicrophone);
