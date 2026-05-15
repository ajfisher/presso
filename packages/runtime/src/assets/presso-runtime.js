(() => {
  const configEl = document.getElementById('presso-runtime-config');
  const config = configEl ? JSON.parse(configEl.textContent || '{}') : {};
  const slides = Array.from(document.querySelectorAll('.presso-slide'));
  const slideMetadata = Array.isArray(config.slides) ? config.slides : [];
  const slideCount = Math.max(slides.length, slideMetadata.length);
  const progress = document.querySelector('.presso-progress > span');
  const mode = document.body.dataset.mode || 'deck';
  const serverSync = Boolean(config.server);
  const notesAllowed = config.notesPublic !== false;
  const routes = config.routes || {};
  const controlUrls = Array.isArray(config.controlUrls) ? config.controlUrls : [];
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('presso') : null;
  const notesSizeKey = 'presso:presenter-notes-size';
  const timerStartKey = 'presso:presenter-started-at';
  const initialHashIndex = parseHashIndex(location.hash);
  let index = clampIndex(initialHashIndex ?? 0);
  let presentationFullscreen = false;
  let fullscreenDialogMode = 'enter';
  let wakeLock = null;
  let wakeLockRequested = false;
  let presenterNotesSize = clampNumber(Number(sessionStorage.getItem(notesSizeKey)) || 1.25, 0.9, 2.4);
  let presenterStart = Number(sessionStorage.getItem(timerStartKey)) || Date.now();
  if (mode === 'presenter') {
    sessionStorage.setItem(timerStartKey, String(presenterStart));
    setPresenterNotesSize(presenterNotesSize);
  }

  if (!notesAllowed) {
    document.body.dataset.notesVisible = 'false';
  } else {
    const noteParam = new URLSearchParams(location.search).get('notes');
    if (noteParam === '1' || noteParam === 'true') {
      document.body.dataset.notesVisible = 'true';
    }
  }

  function setIndex(next, source = 'local') {
    index = clampIndex(next);
    renderActiveSlide();
    document.body.dataset.currentSlide = String(index);
    if (progress && slideCount) progress.style.width = String(((index + 1) / slideCount) * 100) + '%';
    if ((mode === 'deck' || mode === 'embed') && slides.length) history.replaceState(null, '', '#/' + index);
    updateStateViews();
    localStorage.setItem('presso:index', String(index));
    if (source === 'local') channel?.postMessage({ index });
    if (source === 'local') postState(index);
  }

  function go(delta) {
    setIndex(index + delta);
  }

  function isEditableTarget(target) {
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  }

  function toggleNotes() {
    if (!notesAllowed) return;
    document.body.dataset.notesVisible = document.body.dataset.notesVisible === 'true' ? 'false' : 'true';
  }

  function toggleShortcuts(force) {
    const visible = force ?? document.body.dataset.shortcutsVisible !== 'true';
    document.body.dataset.shortcutsVisible = visible ? 'true' : 'false';
  }

  function enterFullscreen() {
    const request = document.documentElement.requestFullscreen?.();
    request?.then?.(hideFullscreenPrompt)?.catch?.(() => showFullscreenPrompt('enter'));
  }

  function exitFullscreen() {
    const exit = document.exitFullscreen?.();
    exit?.then?.(hideFullscreenPrompt)?.catch?.(() => {});
  }

  function openRoute(name) {
    if (!routes[name]) return;
    window.open(routes[name], `presso-${name}`, 'noopener');
  }

  function showControllerPopover() {
    const popover = document.querySelector('[data-controller-popover]');
    if (!(popover instanceof HTMLElement)) return;
    const url = controlUrls[0] || new URL(routes.control || '/control', location.href).href;
    const link = popover.querySelector('[data-controller-url]');
    const qr = popover.querySelector('[data-controller-qr]');
    const list = popover.querySelector('[data-controller-url-list]');
    if (link instanceof HTMLAnchorElement) {
      link.href = url;
      link.textContent = url;
    }
    if (qr instanceof HTMLElement) {
      renderQrCode(qr, url);
    }
    if (list instanceof HTMLElement) {
      list.innerHTML = controlUrls.slice(1).map((candidate) => `<a href="${escapeHtml(candidate)}">${escapeHtml(candidate)}</a>`).join('');
    }
    popover.hidden = false;
  }

  function hideControllerPopover() {
    const popover = document.querySelector('[data-controller-popover]');
    if (popover instanceof HTMLElement) popover.hidden = true;
  }

  function renderActiveSlide() {
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
  }

  function updateStateViews() {
    const activeSlide = slides[index];
    const nextSlide = slides[index + 1];
    const activeMetadata = slideMetadata[index];
    const nextMetadata = slideMetadata[index + 1];
    const activeNotes = activeSlide?.querySelector('.presso-slide-notes')?.innerHTML || '';
    const nextPreview = document.querySelector(`template[data-slide-preview-template="${index + 1}"]`);
    document.querySelectorAll('[data-current-title]').forEach((el) => {
      el.textContent = activeSlide?.dataset.title || activeMetadata?.title || '';
    });
    document.querySelectorAll('[data-next-title]').forEach((el) => {
      el.textContent = nextSlide?.dataset.title || nextMetadata?.title || 'End';
    });
    document.querySelectorAll('[data-next-preview]').forEach((el) => {
      el.innerHTML = nextPreview?.innerHTML || '';
    });
    document.querySelectorAll('[data-current-notes]').forEach((el) => {
      el.innerHTML = activeNotes;
    });
    document.querySelectorAll('[data-current-position]').forEach((el) => {
      el.textContent = String(slideCount ? index + 1 : 0);
    });
    document.querySelectorAll('[data-slide-count]').forEach((el) => {
      el.textContent = String(slideCount);
    });
    document.querySelectorAll('[data-current-target-time], [data-timing]').forEach((el) => {
      el.textContent = activeSlide?.dataset.targetTime || 'No target';
    });
    updateNavigationButtons();
    updatePresenterTimer();
  }

  function updatePresenterTimer() {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - presenterStart) / 1000));
    document.querySelectorAll('[data-elapsed]').forEach((el) => {
      el.textContent = secondsToClock(elapsedSeconds);
    });
    const target = parseClock(slides[index]?.dataset.targetTime || '');
    const delta = target === undefined ? '' : formatDelta(elapsedSeconds - target);
    document.querySelectorAll('[data-time-delta]').forEach((el) => {
      el.textContent = delta || 'No target';
    });
  }

  function resetPresenterTimer() {
    presenterStart = Date.now();
    sessionStorage.setItem(timerStartKey, String(presenterStart));
    updatePresenterTimer();
  }

  function setPresenterNotesSize(next) {
    presenterNotesSize = clampNumber(next, 0.9, 2.4);
    document.documentElement.style.setProperty('--presenter-notes-size', presenterNotesSize.toFixed(2) + 'rem');
    sessionStorage.setItem(notesSizeKey, String(presenterNotesSize));
  }

  function requestPresentationFullscreen() {
    if (mode === 'deck' || mode === 'embed') {
      if (document.fullscreenElement) {
        showFullscreenPrompt('exit');
      } else {
        enterFullscreen();
      }
      return;
    }
    if (!serverSync) return;
    if (presentationFullscreen) return;
    postCommand({ type: 'presentation-fullscreen-enter' });
  }

  async function toggleWakeLock() {
    if (wakeLock) {
      wakeLockRequested = false;
      await wakeLock.release().catch(() => {});
      wakeLock = null;
      updateWakeLockViews();
      return;
    }
    wakeLockRequested = true;
    await requestWakeLock();
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      wakeLockRequested = false;
      updateWakeLockViews('Unavailable');
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        updateWakeLockViews();
      });
      updateWakeLockViews();
    } catch {
      wakeLockRequested = false;
      updateWakeLockViews('Unavailable');
    }
  }

  function updateNavigationButtons() {
    document.querySelectorAll('button[data-action="prev"]').forEach((button) => {
      button.disabled = index <= 0;
    });
    document.querySelectorAll('button[data-action="next"]').forEach((button) => {
      button.disabled = !slideCount || index >= slideCount - 1;
    });
  }

  function setSyncStatus(status) {
    document.querySelectorAll('[data-sync-status]').forEach((el) => {
      el.textContent = status;
    });
  }

  function updateFullscreenViews() {
    const active = mode === 'deck' || mode === 'embed' ? Boolean(document.fullscreenElement) : presentationFullscreen;
    document.body.dataset.presentationFullscreen = presentationFullscreen ? 'true' : 'false';
    document.querySelectorAll('button[data-action="fullscreen"]').forEach((button) => {
      const remoteControl = mode === 'control' || mode === 'presenter';
      button.textContent = active
        ? remoteControl ? 'Full screen active' : 'Exit full screen'
        : 'Full screen';
      button.disabled = remoteControl && active;
    });
  }

  function updateWakeLockViews(label) {
    const active = Boolean(wakeLock);
    document.body.dataset.wakeLock = active ? 'true' : 'false';
    document.querySelectorAll('[data-wake-lock-toggle]').forEach((input) => {
      input.checked = active;
      input.disabled = label === 'Unavailable';
    });
    document.querySelectorAll('[data-wake-lock-label]').forEach((el) => {
      el.textContent = label || 'Keep awake';
    });
    document.querySelectorAll('[data-wake-lock-control]').forEach((el) => {
      el.dataset.active = active ? 'true' : 'false';
      el.dataset.unavailable = label === 'Unavailable' ? 'true' : 'false';
    });
  }

  function postState(next, extra = {}) {
    if (!serverSync) return Promise.resolve();
    setSyncStatus('Syncing');
    return fetch('/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ index: next, ...extra })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('State update failed');
        const state = await response.json();
        setSyncStatus('Synced');
        applyServerState(state, 'server');
      })
      .catch(() => setSyncStatus('Offline'));
  }

  function postCommand(command) {
    setSyncStatus('Syncing');
    return fetch('/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command)
    })
      .then((response) => {
        if (!response.ok) throw new Error('Command failed');
        setSyncStatus('Synced');
      })
      .catch(() => setSyncStatus('Offline'));
  }

  function connectServerEvents() {
    if (!serverSync) return;
    if (!('EventSource' in window)) {
      setSyncStatus('Unsupported');
      return;
    }
    const events = new EventSource('/events');
    events.addEventListener('open', () => setSyncStatus('Synced'));
    events.addEventListener('state', (event) => {
      setSyncStatus('Synced');
      applyServerState(JSON.parse(event.data), 'remote');
    });
    events.addEventListener('command', (event) => {
      const command = JSON.parse(event.data);
      if (!(mode === 'deck' || mode === 'embed')) return;
      if (command.type === 'presentation-fullscreen-enter') {
        showFullscreenPrompt('enter');
      }
    });
    events.addEventListener('reload', () => location.reload());
    events.addEventListener('error', () => setSyncStatus('Reconnecting'));
  }

  function applyServerState(state, source) {
    if (typeof state.fullscreen === 'boolean') {
      presentationFullscreen = state.fullscreen;
      updateFullscreenViews();
    }
    if (Number.isFinite(Number(state.index))) setIndex(Number(state.index), source);
  }

  function showFullscreenPrompt(mode) {
    fullscreenDialogMode = mode;
    const prompt = document.querySelector('[data-fullscreen-prompt]');
    if (prompt instanceof HTMLElement) {
      const title = prompt.querySelector('[data-fullscreen-title]');
      const message = prompt.querySelector('[data-fullscreen-message]');
      const confirm = prompt.querySelector('[data-fullscreen-confirm]');
      if (title) title.textContent = mode === 'exit' ? 'Exit full screen?' : 'Enter full screen?';
      if (message) {
        message.textContent = mode === 'exit'
          ? 'Confirm before leaving full screen on this presentation.'
          : 'Browsers require this confirmation on the presentation screen.';
      }
      if (confirm) confirm.textContent = mode === 'exit' ? 'Exit full screen' : 'Enter full screen';
      prompt.hidden = false;
    }
  }

  function hideFullscreenPrompt() {
    const prompt = document.querySelector('[data-fullscreen-prompt]');
    if (prompt instanceof HTMLElement) {
      prompt.hidden = true;
    }
  }

  document.addEventListener('keydown', (event) => {
    if (isEditableTarget(event.target)) return;
    if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
      event.preventDefault();
      go(1);
    }
    if (['ArrowLeft', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      go(-1);
    }
    if (event.key === 'f') {
      event.preventDefault();
      requestPresentationFullscreen();
    }
    if (event.key === 'p') {
      event.preventDefault();
      openRoute('presenter');
    }
    if (event.key === 'n') {
      event.preventDefault();
      toggleNotes();
    }
    if (event.key === '?') {
      event.preventDefault();
      toggleShortcuts();
    }
    if (event.key === 'Escape') toggleShortcuts(false);
  });

  document.addEventListener('fullscreenchange', () => {
    document.body.dataset.fullscreen = document.fullscreenElement ? 'true' : 'false';
    if (mode === 'deck' || mode === 'embed') {
      presentationFullscreen = Boolean(document.fullscreenElement);
      hideFullscreenPrompt();
      updateFullscreenViews();
      postState(index, { fullscreen: presentationFullscreen });
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest('[data-action]')?.dataset.action;
    if (action === 'next') go(1);
    if (action === 'prev') go(-1);
    if (action === 'notes') toggleNotes();
    if (action === 'fullscreen') requestPresentationFullscreen();
    if (action === 'fullscreen-confirm') {
      if (fullscreenDialogMode === 'exit') exitFullscreen();
      else enterFullscreen();
    }
    if (action === 'fullscreen-dismiss') hideFullscreenPrompt();
    if (action === 'controller-open') showControllerPopover();
    if (action === 'controller-close') hideControllerPopover();
    if (action === 'wake-lock') toggleWakeLock();
    if (action === 'presenter') openRoute('presenter');
    if (action === 'control') openRoute('control');
    if (action === 'shortcuts') toggleShortcuts();
    if (action === 'shortcuts-close') toggleShortcuts(false);
    if (action === 'font-plus') setPresenterNotesSize(presenterNotesSize + 0.15);
    if (action === 'font-minus') setPresenterNotesSize(presenterNotesSize - 0.15);
    if (action === 'timer-reset') resetPresenterTimer();
  });

  window.addEventListener('hashchange', () => {
    const next = parseHashIndex(location.hash);
    if (next !== undefined) setIndex(next);
  });

  channel?.addEventListener('message', (event) => setIndex(Number(event.data.index), 'remote'));
  setSyncStatus(serverSync ? 'Connecting' : 'Local');
  setIndex(index, 'init');
  updateFullscreenViews();
  if (serverSync && initialHashIndex !== undefined && (mode === 'deck' || mode === 'embed')) {
    postState(index).finally(connectServerEvents);
  } else {
    connectServerEvents();
  }
  if (mode === 'presenter') {
    window.setInterval(updatePresenterTimer, 1000);
  }
  document.addEventListener('visibilitychange', () => {
    if (wakeLockRequested && document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
  });

  function parseHashIndex(hash) {
    const match = hash.match(/^#\/(\d+)$/);
    return match ? Number(match[1]) : undefined;
  }

  function secondsToClock(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = String(seconds % 60).padStart(2, '0');
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`;
    return `${minutes}:${secs}`;
  }

  function parseClock(value) {
    if (!value) return undefined;
    const parts = value.split(':').map(Number);
    if (parts.some((part) => Number.isNaN(part))) return undefined;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return undefined;
  }

  function formatDelta(seconds) {
    if (seconds === 0) return 'On time';
    const sign = seconds > 0 ? '+' : '-';
    return sign + secondsToClock(Math.abs(seconds));
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampIndex(value) {
    const numeric = Math.trunc(Number(value));
    const max = Math.max(0, slideCount - 1);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(max, Math.max(0, numeric));
  }

  function renderQrCode(target, text) {
    try {
      const modules = createQrModules(text);
      const quiet = 4;
      const size = modules.length + quiet * 2;
      const path = modules.map((row, y) => row
        .map((dark, x) => dark ? `M${x + quiet} ${y + quiet}h1v1h-1z` : '')
        .join('')).join('');
      target.innerHTML = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#111" d="${path}"/></svg>`;
    } catch {
      target.textContent = text;
    }
  }

  function createQrModules(text) {
    const version = 5;
    const size = 21 + (version - 1) * 4;
    const dataCodewords = 108;
    const eccCodewords = 26;
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 106) throw new Error('QR value is too long.');

    const data = makeQrDataCodewords(bytes, dataCodewords);
    const ecc = reedSolomonRemainder(data, reedSolomonDivisor(eccCodewords));
    const codewords = [...data, ...ecc];
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    const setFunction = (x, y, dark) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = dark;
      reserved[y][x] = true;
    };

    drawFinder(modules, reserved, setFunction, 0, 0);
    drawFinder(modules, reserved, setFunction, size - 7, 0);
    drawFinder(modules, reserved, setFunction, 0, size - 7);
    drawAlignment(setFunction, 30, 30);
    for (let i = 8; i < size - 8; i++) {
      setFunction(i, 6, i % 2 === 0);
      setFunction(6, i, i % 2 === 0);
    }
    setFunction(8, 4 * version + 9, true);
    drawFormatBits(setFunction, size, 0);

    const bits = codewords.flatMap((value) => Array.from({ length: 8 }, (_bit, i) => Boolean((value >>> (7 - i)) & 1)));
    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right--;
      for (let vert = 0; vert < size; vert++) {
        const y = upward ? size - 1 - vert : vert;
        for (let offset = 0; offset < 2; offset++) {
          const x = right - offset;
          if (reserved[y][x]) continue;
          let dark = bitIndex < bits.length ? bits[bitIndex++] : false;
          if ((x + y) % 2 === 0) dark = !dark;
          modules[y][x] = dark;
        }
      }
      upward = !upward;
    }
    drawFormatBits(setFunction, size, formatBits(1, 0));
    return modules;
  }

  function drawFinder(_modules, _reserved, setFunction, x, y) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
          (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setFunction(xx, yy, dark);
      }
    }
  }

  function drawAlignment(setFunction, x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function drawFormatBits(setFunction, size, bits) {
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(bits, i));
    setFunction(8, 7, bit(bits, 6));
    setFunction(8, 8, bit(bits, 7));
    setFunction(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(bits, i));
  }

  function makeQrDataCodewords(bytes, dataCodewords) {
    const bits = [0, 1, 0, 0];
    appendBits(bits, bytes.length, 8);
    bytes.forEach((value) => appendBits(bits, value, 8));
    const capacity = dataCodewords * 8;
    appendBits(bits, 0, Math.min(4, capacity - bits.length));
    while (bits.length % 8) bits.push(0);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      codewords.push(bits.slice(i, i + 8).reduce((value, next) => (value << 1) | Number(next), 0));
    }
    for (let pad = 0xec; codewords.length < dataCodewords; pad ^= 0xfd) codewords.push(pad);
    return codewords;
  }

  function appendBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i--) bits.push(Boolean((value >>> i) & 1));
  }

  function reedSolomonDivisor(degree) {
    const result = Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 2);
    }
    return result;
  }

  function reedSolomonRemainder(data, divisor) {
    const result = Array(divisor.length).fill(0);
    data.forEach((value) => {
      const factor = value ^ result.shift();
      result.push(0);
      divisor.forEach((coefficient, i) => {
        result[i] ^= gfMultiply(coefficient, factor);
      });
    });
    return result;
  }

  function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function formatBits(errorCorrectionLevel, mask) {
    const data = (errorCorrectionLevel << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) {
      remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
    }
    return ((data << 10) | (remainder & 0x3ff)) ^ 0x5412;
  }

  function bit(value, index) {
    return Boolean((value >>> index) & 1);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
})();
