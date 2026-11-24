export const SAMPLE_RATE = 16000;

export async function openMicrophone(deviceId, onLevel, onEnded) {
  const audio = deviceId ? { deviceId: { exact: deviceId } } : true;
  const stream = await navigator.mediaDevices.getUserMedia({ audio });
  const track = stream.getAudioTracks()[0];
  let context;
  track.addEventListener('ended', onEnded);
  try {
    context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await context.audioWorklet.addModule(new URL('./presso-audio-worklet.js', import.meta.url));
    await context.resume();
    if (track.readyState !== 'live') throw new Error('The microphone disconnected.');
    const worklet = new AudioWorkletNode(context, 'presso-microphone', {
      channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1]
    });
    const input = context.createMediaStreamSource(stream);
    input.connect(worklet);
    // A silent output keeps the worklet alive without playing the microphone through the speakers.
    worklet.connect(context.destination);
    let closed = false;
    const onContextChange = () => {
      if (!closed && context.state !== 'running') onEnded();
    };
    context.addEventListener('statechange', onContextChange);
    let onAudio;
    let started;
    let stopped;
    worklet.port.onmessage = ({ data }) => {
      if (data.type === 'level') onLevel(data.peak);
      if (data.type === 'audio') onAudio?.(data.samples);
      if (data.type === 'started') {
        const { contextTime, performanceTime } = context.getOutputTimestamp();
        started?.(performanceTime ? performanceTime + (data.time - contextTime) * 1000 : performance.now());
      }
      if (data.type === 'stopped') stopped?.();
    };
    return {
      label: track.label,
      deviceId: track.getSettings().deviceId,
      start(capture) {
        if (closed || track.readyState !== 'live' || context.state !== 'running') {
          throw new Error('The microphone disconnected. Check the input again.');
        }
        onAudio = capture;
        return workletCommand('start', (resolve) => { started = resolve; });
      },
      stop() {
        return workletCommand('stop', (resolve) => { stopped = resolve; });
      },
      close() {
        if (closed) return;
        closed = true;
        track.removeEventListener('ended', onEnded);
        context.removeEventListener('statechange', onContextChange);
        track.stop();
        worklet.port.close();
        void context.close();
      }
    };

    function workletCommand(command, listen) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The microphone stopped responding.')), 2000);
        listen((value) => {
          clearTimeout(timer);
          resolve(value);
        });
        worklet.port.postMessage(command);
      });
    }
  } catch (error) {
    track.removeEventListener('ended', onEnded);
    track.stop();
    if (context && context.state !== 'closed') void context.close();
    throw error;
  }
}

export function makeRecordingWave(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  const header = new DataView(new ArrayBuffer(44));
  for (const [offset, marker] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
    for (let i = 0; i < 4; i += 1) header.setUint8(offset + i, marker.charCodeAt(i));
  }
  header.setUint32(4, 36 + length, true);
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, SAMPLE_RATE, true);
  header.setUint32(28, SAMPLE_RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  header.setUint32(40, length, true);
  return new Blob([header, ...chunks], { type: 'audio/wav' });
}

export function setupMicrophone(dialog, onStart, onLevel, onLost) {
  const panel = dialog.querySelector('[data-rehearsal-microphone]');
  const input = panel.querySelector('[data-microphone-input]');
  const meter = panel.querySelector('meter');
  const status = panel.querySelector(':scope > [role="status"]');
  const check = panel.querySelector('[data-microphone-check]');
  const start = panel.querySelector('[data-microphone-start]');
  let microphone;
  let version = 0;

  function release() {
    version += 1;
    microphone?.close();
    microphone = undefined;
    start.disabled = true;
    meter.value = 0;
  }

  async function prepare() {
    release();
    const attempt = version;
    check.disabled = true;
    input.disabled = true;
    status.textContent = 'Opening microphone…';
    try {
      const device = await openMicrophone(input.value, (peak) => {
        meter.value = peak;
        onLevel(peak);
      }, () => {
        release();
        status.textContent = 'The microphone disconnected.';
        onLost();
      });
      if (attempt !== version) {
        device.close();
        return;
      }
      microphone = device;
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === 'audioinput' && item.deviceId !== 'default');
      if (attempt !== version) return;
      const selected = input.value;
      input.replaceChildren(new Option('System default', ''), ...devices.map((item) => new Option(item.label || 'Microphone', item.deviceId)));
      input.value = devices.some((item) => item.deviceId === selected) ? selected : '';
      status.textContent = `${device.label || 'Microphone'} is ready. Speak to check the level.`;
      start.disabled = false;
    } catch (error) {
      if (attempt !== version) return;
      release();
      status.textContent = error?.name === 'NotAllowedError'
        ? 'Allow microphone access in Chrome, then check again.'
        : 'Chrome could not open this microphone.';
    } finally {
      check.disabled = false;
      input.disabled = false;
    }
  }

  check.addEventListener('click', prepare);
  input.addEventListener('change', prepare);
  start.addEventListener('click', () => {
    if (!microphone) return;
    const device = microphone;
    microphone = undefined;
    start.disabled = true;
    check.disabled = true;
    input.disabled = true;
    onStart(device);
  });

  return {
    show() {
      panel.hidden = false;
      check.disabled = false;
      input.disabled = false;
      status.textContent = '';
    },
    failed(message) {
      status.textContent = message;
      check.disabled = false;
      input.disabled = false;
    },
    hide() {
      panel.hidden = true;
      release();
    }
  };
}

export function setupAudioReview(dialog, store, deckId, onDelete) {
  const panel = dialog.querySelector('[data-rehearsal-recording]');
  const audio = panel.querySelector('audio');
  const actions = panel.querySelector('[data-audio-actions]');
  const status = panel.querySelector(':scope > [role="status"]');
  let selected;
  let waveUrl;
  let waveRequest;
  let version = 0;

  function clear() {
    version += 1;
    selected = undefined;
    if (waveUrl) URL.revokeObjectURL(waveUrl);
    waveUrl = undefined;
    waveRequest = undefined;
    actions.hidden = true;
    audio.removeAttribute('src');
    audio.load();
    audio.hidden = true;
    panel.hidden = true;
  }

  async function show(run) {
    clear();
    if (!run?.audio) return;
    const attempt = version;
    try {
      const count = await store().countAudio(run.id);
      if (attempt !== version) return;
      panel.hidden = false;
      if (!count) {
        status.textContent = 'No audio was saved for this recording.';
        return;
      }
      selected = run;
      actions.hidden = false;
      status.textContent = run.audio.finished ? '' : 'Recovered audio from an interrupted recording.';
      return true;
    } catch {
      if (attempt !== version) return;
      panel.hidden = false;
      status.textContent = 'Chrome could not read the saved audio.';
    }
  }

  async function loadWave() {
    const attempt = version;
    if (!selected) return false;
    waveRequest ??= store().readAudio(selected.id).then((chunks) => {
      if (attempt !== version) return false;
      if (!chunks.length) throw new Error('This recording is no longer saved.');
      waveUrl = URL.createObjectURL(makeRecordingWave(chunks.map(({ pcm }) => pcm)));
      return true;
    }).catch((error) => {
      if (attempt === version) waveRequest = undefined;
      throw error;
    });
    return waveRequest;
  }

  panel.querySelector('[data-audio-play]').addEventListener('click', async () => {
    try {
      if (!await loadWave()) return;
      audio.src = waveUrl;
      audio.hidden = false;
      await audio.play();
    } catch {
      status.textContent = 'Chrome could not play the saved audio.';
    }
  });
  panel.querySelector('[data-audio-download]').addEventListener('click', async () => {
    try {
      if (!await loadWave()) return;
      const link = document.createElement('a');
      link.href = waveUrl;
      link.download = `presso-recording-${new Date(selected.startedAt).toISOString().replaceAll(':', '-')}.wav`;
      link.click();
    } catch {
      status.textContent = 'Chrome could not prepare the audio download.';
    }
  });
  panel.querySelector('[data-audio-delete]').addEventListener('click', async () => {
    const run = selected;
    if (!run || !window.confirm('Delete this recording and its transcript? The slide timings will stay.')) return;
    try {
      await navigator.locks.request(`presso:rehearsal:${deckId}`, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('Stop the rehearsal in the other tab before deleting a recording.');
        await navigator.locks.request('presso:transcription', { ifAvailable: true }, async (speechLock) => {
          if (!speechLock) throw new Error('Pause transcription before deleting the recording.');
          await store().deleteAudio(run.id);
          delete run.audio;
          delete run.transcript;
        });
      });
      if (selected === run) {
        clear();
        onDelete(run);
      }
    } catch (error) {
      status.textContent = error?.message ?? 'Chrome could not delete the recording.';
    }
  });
  return { show, clear };
}
