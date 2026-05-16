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
  const canNavigateSlides = ['deck', 'embed', 'presenter', 'control'].includes(mode);
  const canDirectFullscreen = mode === 'deck' || mode === 'embed';
  const canRemoteControlFullscreen = mode === 'presenter' || mode === 'control';
  let controllerUrls = Array.isArray(config.controlUrls) ? config.controlUrls : [];
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('presso') : null;
  const notesSizeKey = 'presso:presenter-notes-size';
  const timerStartKey = 'presso:presenter-started-at';
  const teleprompterEnabledKey = 'presso:teleprompter-enabled';
  const teleprompterPausedKey = 'presso:teleprompter-paused';
  const teleprompterWpmKey = 'presso:teleprompter-wpm';
  const teleprompterDefaultWpm = 160;
  const teleprompterMinWpm = 80;
  const teleprompterMaxWpm = 220;
  const teleprompterStepWpm = 10;
  const teleprompterMaxLagMs = 8000;
  const initialHashIndex = parseHashIndex(location.hash);
  let index = clampIndex(initialHashIndex ?? 0);
  let presentationFullscreen = false;
  let fullscreenDialogMode = 'enter';
  let wakeLock = null;
  let wakeLockRequested = false;
  let selectedControllerUrl = null;
  let controllerUrlSelectedByUser = false;
  let presenterNotesSize = clampNumber(Number(sessionStorage.getItem(notesSizeKey)) || 1.25, 0.9, 2.4);
  let presenterStart = Number(sessionStorage.getItem(timerStartKey)) || Date.now();
  let teleprompterEnabled = sessionStorage.getItem(teleprompterEnabledKey) === 'true';
  let teleprompterPaused = sessionStorage.getItem(teleprompterPausedKey) === 'true';
  let teleprompterWpm = clampNumber(Number(sessionStorage.getItem(teleprompterWpmKey)) || teleprompterDefaultWpm, teleprompterMinWpm, teleprompterMaxWpm);
  let teleprompterFrame = 0;
  let teleprompterStartTime = 0;
  let teleprompterStartScroll = 0;
  let teleprompterEndScroll = 0;
  let teleprompterDurationMs = 0;
  if (mode === 'presenter') {
    sessionStorage.setItem(timerStartKey, String(presenterStart));
    setPresenterNotesSize(presenterNotesSize);
    persistTeleprompterState();
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
    if (!canNavigateSlides) return;
    index = clampIndex(next);
    renderActiveSlide();
    document.body.dataset.currentSlide = String(index);
    if (progress && slideCount) progress.style.width = String(progressPercent(index)) + '%';
    if (canDirectFullscreen && slides.length) history.replaceState(null, '', '#/' + index);
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
    popover.hidden = false;
    updateControllerPopoverUrls(availableControllerUrls());
    refreshControllerUrls().then((urls) => updateControllerPopoverUrls(availableControllerUrls(urls)));
  }

  function updateControllerPopoverUrls(urls) {
    const url = controllerUrlSelectedByUser && selectedControllerUrl && urls.includes(selectedControllerUrl) ? selectedControllerUrl : urls[0];
    selectedControllerUrl = url;
    renderControllerUrlOptions(urls, url);
    selectControllerUrl(url);
  }

  function hideControllerPopover() {
    const popover = document.querySelector('[data-controller-popover]');
    if (popover instanceof HTMLElement) popover.hidden = true;
  }

  async function refreshControllerUrls() {
    if (!serverSync) return controllerUrls;
    try {
      const response = await fetch('/control-urls', { cache: 'no-store' });
      if (!response.ok) return controllerUrls;
      const data = await response.json();
      if (Array.isArray(data.controlUrls)) {
        controllerUrls = data.controlUrls.filter((url) => typeof url === 'string' && url);
      }
    } catch {
      // Keep the embedded URLs if the dev-server helper is unavailable.
    }
    return controllerUrls;
  }

  function availableControllerUrls(urls = controllerUrls) {
    const routeUrl = new URL(routes.control || '/control', location.href).href;
    return [...new Set([...urls, routeUrl])];
  }

  function selectControllerUrl(url, userInitiated = false) {
    selectedControllerUrl = url;
    if (userInitiated) controllerUrlSelectedByUser = true;
    const popover = document.querySelector('[data-controller-popover]');
    if (!(popover instanceof HTMLElement)) return;
    const link = popover.querySelector('[data-controller-url]');
    const openLink = popover.querySelector('[data-controller-url-open]');
    const qr = popover.querySelector('[data-controller-qr]');
    if (link instanceof HTMLAnchorElement) {
      link.href = url;
      link.textContent = url;
    }
    if (openLink instanceof HTMLAnchorElement) {
      openLink.href = url;
    }
    if (qr instanceof HTMLElement) {
      renderQrCode(qr, url);
    }
    popover.querySelectorAll('input[data-action="controller-url-select"]').forEach((input) => {
      if (input instanceof HTMLInputElement) input.checked = input.value === url;
    });
  }

  function renderControllerUrlOptions(urls, selectedUrl) {
    const list = document.querySelector('[data-controller-url-list]');
    if (!(list instanceof HTMLFieldSetElement)) return;
    const legend = list.querySelector('legend') ?? document.createElement('legend');
    legend.textContent = 'Controller URL';
    list.replaceChildren(legend);
    urls.forEach((url) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      const text = document.createElement('span');
      const open = document.createElement('a');
      input.type = 'radio';
      input.name = 'presso-controller-url';
      input.value = url;
      input.checked = url === selectedUrl;
      input.dataset.action = 'controller-url-select';
      text.textContent = url;
      open.href = url;
      open.target = '_blank';
      open.rel = 'noreferrer';
      open.dataset.action = 'controller-url-open';
      open.dataset.controllerOpenUrl = url;
      open.ariaLabel = `Open ${url}`;
      open.textContent = '↗';
      label.append(input, text, open);
      list.append(label);
    });
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
    updateNotesProgress();
    document.querySelectorAll('[data-current-position]').forEach((el) => {
      el.textContent = String(slideCount ? index + 1 : 0);
    });
    document.querySelectorAll('[data-slide-count]').forEach((el) => {
      el.textContent = String(slideCount);
    });
    document.querySelectorAll('[data-current-target-time], [data-timing]').forEach((el) => {
      el.textContent = activeSlide?.dataset.targetTime || 'No target';
    });
    updatePresenterPreviewScales();
    updateNavigationButtons();
    updatePresenterTimer();
    resetTeleprompterForSlide();
  }

  function updatePresenterPreviewScales() {
    if (mode !== 'presenter') return;
    document.querySelectorAll('aside .presso-stage, aside [data-next-preview]').forEach((frame) => {
      if (!(frame instanceof HTMLElement)) return;
      const slide = frame.querySelector('.presso-slide.is-active') || frame.querySelector('.presso-slide');
      if (!(slide instanceof HTMLElement)) return;
      const frameRect = frame.getBoundingClientRect();
      const slideRect = slide.getBoundingClientRect();
      const slideWidth = slide.offsetWidth || slideRect.width;
      const slideHeight = slide.offsetHeight || slideRect.height;
      if (!frameRect.width || !frameRect.height || !slideWidth || !slideHeight) return;
      const scale = Math.min(frameRect.width / slideWidth, frameRect.height / slideHeight);
      frame.style.setProperty('--presenter-preview-scale', String(scale));
      frame.style.setProperty('--presenter-preview-x', `${(frameRect.width - slideWidth * scale) / 2}px`);
      frame.style.setProperty('--presenter-preview-y', `${(frameRect.height - slideHeight * scale) / 2}px`);
    });
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
    restartTeleprompter(false);
  }

  function toggleTeleprompter() {
    if (mode !== 'presenter') return;
    teleprompterEnabled = !teleprompterEnabled;
    teleprompterPaused = false;
    persistTeleprompterState();
    restartTeleprompter(true);
  }

  function toggleTeleprompterPause() {
    if (mode !== 'presenter' || !teleprompterEnabled) return;
    teleprompterPaused = !teleprompterPaused;
    persistTeleprompterState();
    if (teleprompterPaused) {
      stopTeleprompter();
    } else {
      restartTeleprompter(false);
    }
  }

  function setTeleprompterWpm(next) {
    if (mode !== 'presenter') return;
    teleprompterWpm = clampNumber(next, teleprompterMinWpm, teleprompterMaxWpm);
    persistTeleprompterState();
    restartTeleprompter(false);
  }

  function resetTeleprompterScroll() {
    if (mode !== 'presenter') return;
    restartTeleprompter(true);
  }

  function resetTeleprompterForSlide() {
    if (mode !== 'presenter') return;
    restartTeleprompter(true);
  }

  function restartTeleprompter(resetScroll) {
    if (mode !== 'presenter') return;
    stopTeleprompter();
    const notes = currentNotesElement();
    if (notes && resetScroll) notes.scrollTop = 0;
    updateNotesProgress();
    updateTeleprompterViews();
    if (!notes || !teleprompterEnabled || teleprompterPaused) return;
    startTeleprompter(notes, resetScroll);
  }

  function startTeleprompter(notes, resetScroll) {
    const scrollMax = Math.max(0, notes.scrollHeight - notes.clientHeight);
    if (!scrollMax) {
      updateTeleprompterViews();
      return;
    }

    const wordCount = countWords(notes.textContent || '');
    const firstBlockWords = countWords(firstNotesBlockText(notes));
    const fullDurationMs = Math.max(1000, (Math.max(1, wordCount) / teleprompterWpm) * 60000);
    teleprompterStartScroll = resetScroll ? 0 : notes.scrollTop;
    teleprompterEndScroll = scrollMax;
    teleprompterDurationMs = fullDurationMs * Math.max(0, (teleprompterEndScroll - teleprompterStartScroll) / Math.max(1, scrollMax));
    const delayMs = resetScroll ? Math.min(teleprompterMaxLagMs, (firstBlockWords / teleprompterWpm) * 60000) : 0;
    teleprompterStartTime = performance.now() + delayMs;
    notes.scrollTop = teleprompterStartScroll;
    updateNotesProgress();
    teleprompterFrame = requestAnimationFrame(runTeleprompter);
  }

  function runTeleprompter(now) {
    const notes = currentNotesElement();
    if (!notes || !teleprompterEnabled || teleprompterPaused) return;
    if (now < teleprompterStartTime) {
      teleprompterFrame = requestAnimationFrame(runTeleprompter);
      return;
    }

    const progress = teleprompterDurationMs > 0 ? clampNumber((now - teleprompterStartTime) / teleprompterDurationMs, 0, 1) : 1;
    notes.scrollTop = teleprompterStartScroll + ((teleprompterEndScroll - teleprompterStartScroll) * progress);
    updateNotesProgress();
    if (progress < 1) teleprompterFrame = requestAnimationFrame(runTeleprompter);
    else teleprompterFrame = 0;
  }

  function stopTeleprompter() {
    if (teleprompterFrame) cancelAnimationFrame(teleprompterFrame);
    teleprompterFrame = 0;
  }

  function updateTeleprompterViews() {
    if (mode !== 'presenter') return;
    document.body.dataset.teleprompter = teleprompterEnabled ? teleprompterPaused ? 'paused' : 'running' : 'off';
    document.querySelectorAll('[data-teleprompter-toggle]').forEach((button) => {
      button.textContent = teleprompterEnabled ? 'Prompter on' : 'Prompter';
      button.setAttribute('aria-pressed', teleprompterEnabled ? 'true' : 'false');
    });
    document.querySelectorAll('[data-teleprompter-pause]').forEach((button) => {
      button.textContent = teleprompterPaused ? 'Resume' : 'Pause';
      button.disabled = !teleprompterEnabled;
    });
    document.querySelectorAll('[data-teleprompter-wpm]').forEach((el) => {
      el.textContent = `${teleprompterWpm} wpm`;
    });
  }

  function persistTeleprompterState() {
    sessionStorage.setItem(teleprompterEnabledKey, String(teleprompterEnabled));
    sessionStorage.setItem(teleprompterPausedKey, String(teleprompterPaused));
    sessionStorage.setItem(teleprompterWpmKey, String(teleprompterWpm));
  }

  function currentNotesElement() {
    const notes = document.querySelector('[data-current-notes]');
    return notes instanceof HTMLElement ? notes : null;
  }

  function updateNotesProgress() {
    if (mode !== 'presenter') return;
    const notes = currentNotesElement();
    const progress = document.querySelector('[data-notes-progress]');
    const bar = progress?.querySelector('span');
    if (!(progress instanceof HTMLElement) || !(bar instanceof HTMLElement) || !notes) return;
    const scrollMax = Math.max(0, notes.scrollHeight - notes.clientHeight);
    const value = scrollMax > 0 ? notes.scrollTop / scrollMax : 1;
    const percent = clampNumber(value, 0, 1) * 100;
    bar.style.width = `${percent}%`;
    progress.setAttribute('aria-valuenow', percent.toFixed(1).replace(/\.0$/, ''));
  }

  function firstNotesBlockText(notes) {
    const block = notes.querySelector('p, li, blockquote, pre, h1, h2, h3, h4');
    return block?.textContent || notes.textContent || '';
  }

  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function requestPresentationFullscreen() {
    if (canDirectFullscreen) {
      if (document.fullscreenElement) {
        showFullscreenPrompt('exit');
      } else {
        enterFullscreen();
      }
      return;
    }
    if (!serverSync || !canRemoteControlFullscreen) return;
    if (presentationFullscreen) return;
    postCommand({ type: 'presentation-fullscreen-enter' });
  }

  async function toggleWakeLock() {
    if (isWakeLockActive()) {
      wakeLockRequested = false;
      await releaseWakeLock();
      updateWakeLockViews();
      return;
    }
    wakeLockRequested = true;
    await requestWakeLock();
  }

  async function requestWakeLock() {
    if (canUseNativeWakeLock()) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
          updateWakeLockViews();
        });
        updateWakeLockViews();
        return;
      } catch {
        wakeLock = null;
      }
    }
    wakeLockRequested = false;
    updateWakeLockViews('Unavailable');
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      await wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  function isWakeLockActive() {
    return Boolean(wakeLock);
  }

  function canUseNativeWakeLock() {
    return window.isSecureContext && 'wakeLock' in navigator;
  }

  function canRequestWakeLock() {
    return canUseNativeWakeLock();
  }

  function handleWakeLockUnavailable() {
    if (!canRequestWakeLock()) {
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
    const active = canDirectFullscreen ? Boolean(document.fullscreenElement) : presentationFullscreen;
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
    const active = isWakeLockActive();
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
    if (!serverSync || !canNavigateSlides) return Promise.resolve();
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
      if (!canNavigateSlides) return;
      applyServerState(JSON.parse(event.data), 'remote');
    });
    events.addEventListener('command', (event) => {
      const command = JSON.parse(event.data);
      if (!canDirectFullscreen) return;
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
    if (event.key === 'Home') {
      if (!canNavigateSlides) return;
      event.preventDefault();
      setIndex(0);
    }
    if (event.key === 'End') {
      if (!canNavigateSlides) return;
      event.preventDefault();
      setIndex(slideCount - 1);
    }
    if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
      if (!canNavigateSlides) return;
      event.preventDefault();
      go(1);
    }
    if (['ArrowLeft', 'PageUp'].includes(event.key)) {
      if (!canNavigateSlides) return;
      event.preventDefault();
      go(-1);
    }
    if (event.key === 'f') {
      if (!(canDirectFullscreen || canRemoteControlFullscreen)) return;
      event.preventDefault();
      requestPresentationFullscreen();
    }
    if (event.key === 'p') {
      event.preventDefault();
      openRoute('presenter');
    }
    if (event.key === 'n') {
      if (!(mode === 'deck' || mode === 'embed')) return;
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
    if (canDirectFullscreen) {
      presentationFullscreen = Boolean(document.fullscreenElement);
      hideFullscreenPrompt();
      updateFullscreenViews();
      postState(index, { fullscreen: presentationFullscreen });
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest('[data-action]')?.dataset.action;
    if (action === 'wake-lock') {
      event.preventDefault();
      toggleWakeLock();
      return;
    }
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
    if (action === 'controller-url-select') {
      const input = target?.closest('input[data-action="controller-url-select"]');
      if (input instanceof HTMLInputElement) selectControllerUrl(input.value, true);
    }
    if (action === 'controller-url-open') {
      const link = target?.closest('a[data-action="controller-url-open"]');
      if (link instanceof HTMLAnchorElement && link.dataset.controllerOpenUrl) selectControllerUrl(link.dataset.controllerOpenUrl, true);
    }
    if (action === 'presenter') openRoute('presenter');
    if (action === 'control') openRoute('control');
    if (action === 'shortcuts') toggleShortcuts();
    if (action === 'shortcuts-close') toggleShortcuts(false);
    if (action === 'font-plus') setPresenterNotesSize(presenterNotesSize + 0.15);
    if (action === 'font-minus') setPresenterNotesSize(presenterNotesSize - 0.15);
    if (action === 'timer-reset') resetPresenterTimer();
    if (action === 'teleprompter-toggle') toggleTeleprompter();
    if (action === 'teleprompter-pause') toggleTeleprompterPause();
    if (action === 'teleprompter-slower') setTeleprompterWpm(teleprompterWpm - teleprompterStepWpm);
    if (action === 'teleprompter-faster') setTeleprompterWpm(teleprompterWpm + teleprompterStepWpm);
    if (action === 'teleprompter-reset') resetTeleprompterScroll();
  });

  document.addEventListener('scroll', (event) => {
    if (event.target === currentNotesElement()) updateNotesProgress();
  }, true);

  window.addEventListener('hashchange', () => {
    const next = parseHashIndex(location.hash);
    if (next !== undefined) setIndex(next);
  });
  window.addEventListener('resize', updatePresenterPreviewScales);

  channel?.addEventListener('message', (event) => {
    if (canNavigateSlides) setIndex(Number(event.data.index), 'remote');
  });
  setSyncStatus(serverSync ? 'Connecting' : 'Local');
  if (canNavigateSlides) setIndex(index, 'init');
  updateFullscreenViews();
  updateTeleprompterViews();
  handleWakeLockUnavailable();
  if (serverSync && initialHashIndex !== undefined && (mode === 'deck' || mode === 'embed')) {
    postState(index).finally(connectServerEvents);
  } else {
    connectServerEvents();
  }
  if (mode === 'presenter') {
    window.setInterval(updatePresenterTimer, 1000);
  }
  document.addEventListener('visibilitychange', () => {
    if (wakeLockRequested && document.visibilityState === 'visible' && !isWakeLockActive()) requestWakeLock();
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

  function progressPercent(value) {
    if (slideCount <= 1) return 0;
    return (clampIndex(value) / (slideCount - 1)) * 100;
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

})();
