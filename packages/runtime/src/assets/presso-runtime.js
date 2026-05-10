(() => {
  const configEl = document.getElementById('presso-runtime-config');
  const config = configEl ? JSON.parse(configEl.textContent || '{}') : {};
  const slides = Array.from(document.querySelectorAll('.presso-slide'));
  const progress = document.querySelector('.presso-progress > span');
  const mode = document.body.dataset.mode || 'deck';
  const serverSync = Boolean(config.server);
  const routes = config.routes || {};
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('presso') : null;
  let index = Math.max(0, Math.min(slides.length - 1, Number(location.hash.replace('#/', '')) || 0));

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
    const activeNotes = slides[index]?.querySelector('.presso-slide-notes')?.innerHTML || '';
    document.querySelectorAll('[data-current-title]').forEach((el) => {
      el.textContent = slides[index]?.dataset.title || '';
    });
    document.querySelectorAll('[data-next-title]').forEach((el) => {
      el.textContent = slides[index + 1]?.dataset.title || 'End';
    });
    document.querySelectorAll('[data-current-notes]').forEach((el) => {
      el.innerHTML = activeNotes;
    });
    document.querySelectorAll('[data-timing]').forEach((el) => {
      el.textContent = slides[index]?.dataset.targetTime || '';
    });
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
    if (action === 'font-plus') document.documentElement.style.setProperty('--presenter-notes-size', '1.5rem');
    if (action === 'font-minus') document.documentElement.style.setProperty('--presenter-notes-size', '1rem');
  });

  channel?.addEventListener('message', (event) => setIndex(Number(event.data.index), 'remote'));

  if (serverSync && 'EventSource' in window) {
    const events = new EventSource('/events');
    events.addEventListener('state', (event) => setIndex(JSON.parse(event.data).index, 'remote'));
    events.addEventListener('reload', () => location.reload());
  }

  setIndex(index, 'init');
})();
