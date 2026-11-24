const library = {
  url: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js',
  integrity: 'sha384-xFDNfwR3J/vPYzGjMr1VSM8LHIcA+ii2Ha4x+6WAuISKpT9I0dxgF/mVQW+I0kSd'
};
const wasmBase = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/ort-wasm-simd-threaded.asyncify';
const wasmModule = { url: wasmBase + '.mjs', integrity: 'sha256-CWa2EFzZNnREmKpg33oiy9R68zdNvGSpq1YcCKceNhE=' };
const wasmBinary = { url: wasmBase + '.wasm', integrity: 'sha256-SYcfWkQJUZeX4SdECGim0ZIzOdkYWQfzAaWyodkK8II=' };
const model = 'onnx-community/whisper-base.en_timestamped';
const revision = 'fa239a41836c3305f6beec180e5940f3823ff5b8';

let transcribe;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'prepare') {
      const loaded = await prepare(data.device);
      transcribe = loaded.transcribe;
      self.postMessage({ type: 'ready', device: data.device, offlineReady: loaded.offlineReady });
    } else if (data.type === 'decode') {
      const { chunks } = await transcribe(data.audio, { return_timestamps: 'word' });
      self.postMessage({ type: 'words', words: chunks ?? [] });
    }
  } catch (error) {
    self.postMessage({ type: 'error', text: error.message });
  }
};

async function prepare(device) {
  const cache = await caches.open('presso-transcription-runtime-v1');
  const response = await cachedAsset(cache, library);
  const moduleUrl = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: 'text/javascript' }));
  try {
    const { env, ModelRegistry, pipeline } = await import(moduleUrl);
    const [module, binary] = await Promise.all([cachedAsset(cache, wasmModule), cachedAsset(cache, wasmBinary)]);
    const factory = URL.createObjectURL(new Blob([await module.arrayBuffer()], { type: 'text/javascript' }));
    try {
      // Transformers.js probes metadata without passing the pipeline revision.
      env.remotePathTemplate = `{model}/resolve/${revision}/`;
      env.useBrowserCache = true;
      env.useWasmCache = false;
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.wasmBinary = await binary.arrayBuffer();
      env.backends.onnx.wasm.wasmPaths = { mjs: factory };
      const options = { device, dtype: 'q8', revision };
      const task = 'automatic-speech-recognition';
      const transcribe = await pipeline(task, model, {
        ...options,
        progress_callback: ({ status, progress }) => {
          if (status === 'progress_total' && Number.isFinite(progress)) self.postMessage({ type: 'progress', progress });
        }
      });
      let offlineReady = false;
      try {
        offlineReady = await ModelRegistry.is_pipeline_cached(task, model, options);
      } catch {
        // Inference can still run if Chrome could not cache every model file.
      }
      return { transcribe, offlineReady };
    } finally {
      URL.revokeObjectURL(factory);
    }
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

async function cachedAsset(cache, { url, integrity }) {
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url, { integrity });
  if (!response.ok) throw new Error('Could not download the transcription engine.');
  await cache.put(url, response.clone());
  return response;
}
