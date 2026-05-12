(() => {
  const configEl = document.getElementById('presso-runtime-config');
  const config = configEl ? JSON.parse(configEl.textContent || '{}') : {};
  const slides = Array.from(document.querySelectorAll('.presso-slide'));
  const progress = document.querySelector('.presso-progress > span');
  const mode = document.body.dataset.mode || 'deck';
  const serverSync = Boolean(config.server);
  const notesAllowed = config.notesPublic !== false;
  const routes = config.routes || {};
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('presso') : null;
  const notesSizeKey = 'presso:presenter-notes-size';
  const timerStartKey = 'presso:presenter-started-at';
  let index = Math.max(0, Math.min(slides.length - 1, Number(location.hash.replace('#/', '')) || 0));
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
    if (!slides.length) return;
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
    document.body.dataset.currentSlide = String(index);
    if (progress) progress.style.width = String(((index + 1) / slides.length) * 100) + '%';
    if (mode === 'deck' || mode === 'embed') history.replaceState(null, '', '#/' + index);
    updatePresenter();
    localStorage.setItem('presso:index', String(index));
    if (source === 'local') channel?.postMessage({ index });
    if (source === 'local' && serverSync) {
      fetch('/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ index })
      }).catch(() => {});
    }
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

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      const exit = document.exitFullscreen?.();
      exit?.catch?.(() => {});
      return;
    }
    const request = document.documentElement.requestFullscreen?.();
    request?.catch?.(() => {});
  }

  function openRoute(name) {
    if (!routes[name]) return;
    window.open(routes[name], `presso-${name}`, 'noopener');
  }

  function updatePresenter() {
    const activeSlide = slides[index];
    const nextSlide = slides[index + 1];
    const activeNotes = activeSlide?.querySelector('.presso-slide-notes')?.innerHTML || '';
    const nextPreview = document.querySelector(`template[data-slide-preview-template="${index + 1}"]`);
    document.querySelectorAll('[data-current-title]').forEach((el) => {
      el.textContent = activeSlide?.dataset.title || '';
    });
    document.querySelectorAll('[data-next-title]').forEach((el) => {
      el.textContent = nextSlide?.dataset.title || 'End';
    });
    document.querySelectorAll('[data-next-preview]').forEach((el) => {
      el.innerHTML = nextPreview?.innerHTML || '';
    });
    document.querySelectorAll('[data-current-notes]').forEach((el) => {
      el.innerHTML = activeNotes;
    });
    document.querySelectorAll('[data-current-position]').forEach((el) => {
      el.textContent = String(index + 1);
    });
    document.querySelectorAll('[data-slide-count]').forEach((el) => {
      el.textContent = String(slides.length);
    });
    document.querySelectorAll('[data-current-target-time], [data-timing]').forEach((el) => {
      el.textContent = activeSlide?.dataset.targetTime || 'No target';
    });
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
      toggleFullscreen();
    }
    if (event.key === 'p') {
      event.preventDefault();
      openRoute('presenter');
    }
    if (event.key === 'c') {
      event.preventDefault();
      openRoute('control');
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
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest('[data-action]')?.dataset.action;
    if (action === 'next') go(1);
    if (action === 'prev') go(-1);
    if (action === 'notes') toggleNotes();
    if (action === 'fullscreen') toggleFullscreen();
    if (action === 'presenter') openRoute('presenter');
    if (action === 'control') openRoute('control');
    if (action === 'shortcuts') toggleShortcuts();
    if (action === 'shortcuts-close') toggleShortcuts(false);
    if (action === 'font-plus') setPresenterNotesSize(presenterNotesSize + 0.15);
    if (action === 'font-minus') setPresenterNotesSize(presenterNotesSize - 0.15);
    if (action === 'timer-reset') resetPresenterTimer();
  });

  channel?.addEventListener('message', (event) => setIndex(Number(event.data.index), 'remote'));

  if (serverSync && 'EventSource' in window) {
    const events = new EventSource('/events');
    events.addEventListener('state', (event) => setIndex(JSON.parse(event.data).index, 'remote'));
    events.addEventListener('reload', () => location.reload());
  }

  setIndex(index, 'init');
  if (mode === 'presenter') {
    window.setInterval(updatePresenterTimer, 1000);
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
})();
