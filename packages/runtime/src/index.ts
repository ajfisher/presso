import type { Deck, NotesPublicPolicy, Slide } from '@presso/core';

export type RenderMode = 'deck' | 'presenter' | 'control' | 'notes' | 'embed' | 'print-slides' | 'print-notes-side' | 'print-notes-pages' | 'transcript';

export function renderPage(deck: Deck, mode: RenderMode, options: { server?: boolean } = {}): string {
  if (mode === 'transcript') {
    return renderDocument(deck, mode, renderTranscriptHtml(deck));
  }
  if (mode === 'notes') {
    return renderDocument(deck, mode, renderNotes(deck));
  }
  if (mode === 'control') {
    return renderDocument(deck, mode, renderControl(deck), options);
  }
  if (mode === 'presenter') {
    return renderDocument(deck, mode, renderPresenter(deck), options);
  }
  const body = [
    renderDeck(deck, mode),
    mode === 'embed' && deck.config.notes.public !== false ? renderNotesToggle(deck.config.notes.public) : ''
  ].join('\\n');
  return renderDocument(deck, mode, body, options);
}

export function renderTranscriptMarkdown(deck: Deck): string {
  const lines = [`# ${deck.config.title}`, ''];
  for (const slide of deck.slides) {
    lines.push(`## ${slide.title}`, '');
    if (slide.bodyMarkdown) {
      lines.push(slide.bodyMarkdown, '');
    }
    if (slide.notesMarkdown) {
      lines.push(slide.notesMarkdown, '');
    }
  }
  if (deck.config.baseUrl) {
    lines.push(`[View slides](${deck.config.baseUrl})`, '');
  }
  return lines.join('\\n').trimEnd() + '\\n';
}

export function baseStyles(deck: Deck): string {
  const { width, height } = deck.config.size;
  return `
:root {
  --presso-slide-width: ${width}px;
  --presso-slide-height: ${height}px;
  --presso-accent: #ff5e9a;
  --presso-bg: #202020;
  --presso-fg: #fff;
  --presso-muted: #9a9a9a;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--presso-bg); color: var(--presso-fg); font-family: Inter, system-ui, sans-serif; }
body[data-mode=\"deck\"], body[data-mode=\"embed\"] { overflow: hidden; }
.presso-stage { min-height: 100vh; display: grid; place-items: center; padding: 2vmin; }
.presso-slide { display: none; width: min(100vw, calc(100vh * (${width} / ${height}))); aspect-ratio: ${width} / ${height}; position: relative; overflow: hidden; padding: 5%; background: #2d2d2d; box-shadow: 0 1rem 4rem rgba(0,0,0,.35); }
.presso-slide.is-active, body[data-mode^=\"print\"] .presso-slide { display: grid; }
.presso-slide h1, .presso-slide h2, .presso-slide h3 { color: var(--presso-accent); margin-top: 0; }
.presso-slide[data-layout=\"title\"] { align-content: end; }
.presso-slide[data-layout=\"section\"], .presso-slide[data-layout=\"statement\"] { align-content: center; }
.presso-slide[data-layout=\"image\"], .presso-slide[data-layout=\"image-title\"] { background-size: cover; background-position: center; }
.presso-slide[data-layout=\"two-column\"] .presso-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; }
.presso-logos { display: flex; flex-wrap: wrap; gap: 2rem; align-items: center; justify-content: center; }
.presso-logos img { max-width: 10rem; max-height: 6rem; object-fit: contain; }
.presso-iframe { width: 100%; min-height: 60%; border: 0; background: white; }
.presso-progress { position: fixed; left: 0; right: 0; bottom: 0; height: .45rem; background: rgba(255,255,255,.18); z-index: 10; }
.presso-progress > span { display: block; height: 100%; width: 0; background: var(--presso-accent); transition: width .2s ease; }
.presso-notes-panel { position: fixed; right: 1rem; top: 1rem; bottom: 1rem; width: min(36rem, 35vw); overflow: auto; background: rgba(0,0,0,.78); border-left: .25rem solid var(--presso-accent); padding: 1rem; display: none; }
body[data-notes-visible=\"true\"] .presso-notes-panel { display: block; }
.presso-presenter { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; min-height: 100vh; padding: 1rem; }
.presso-presenter .presso-preview { background: #111; padding: 1rem; overflow: hidden; }
.presso-presenter .presso-notes { font-size: var(--presenter-notes-size, 1.25rem); line-height: 1.45; overflow: auto; max-height: 70vh; }
.presso-controls { display: flex; gap: .75rem; flex-wrap: wrap; margin: 1rem 0; }
.presso-controls button { font: inherit; padding: .7rem 1rem; border: 0; border-radius: .3rem; background: var(--presso-accent); color: white; cursor: pointer; }
.presso-control-page { min-height: 100vh; display: grid; place-items: center; text-align: center; }
.presso-control-page button { font-size: 2rem; margin: .5rem; padding: 1rem 1.5rem; }
.presso-notes-list, .presso-transcript { max-width: 72rem; margin: 0 auto; padding: 3rem 1.5rem; line-height: 1.55; }
body[data-mode=\"print-slides\"], body[data-mode=\"print-notes-side\"], body[data-mode=\"print-notes-pages\"] { background: white; color: #111; }
body[data-mode^=\"print\"] .presso-stage { display: block; padding: 0; }
body[data-mode^=\"print\"] .presso-slide { box-shadow: none; page-break-after: always; color: #111; background-color: white; }
body[data-mode=\"print-notes-side\"] .presso-print-page { display: grid; grid-template-columns: 2fr 1fr; page-break-after: always; }
body[data-mode=\"print-notes-pages\"] .presso-print-notes { page-break-after: always; padding: 2rem; }
@media print { .presso-progress, .presso-controls { display: none !important; } }
`;
}

export function runtimeScript(): string {
  return `
(() => {
  const slides = Array.from(document.querySelectorAll('.presso-slide'));
  const progress = document.querySelector('.presso-progress > span');
  const mode = document.body.dataset.mode || 'deck';
  const serverSync = Boolean(window.__PRESSO_SERVER__);
  let index = Math.max(0, Math.min(slides.length - 1, Number(location.hash.replace('#/', '')) || 0));
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('presso') : null;

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
    if (source === 'local' && serverSync) fetch('/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ index }) }).catch(() => {});
  }
  function go(delta) { setIndex(index + delta); }
  function updatePresenter() {
    document.querySelectorAll('[data-current-title]').forEach((el) => el.textContent = slides[index]?.dataset.title || '');
    document.querySelectorAll('[data-next-title]').forEach((el) => el.textContent = slides[index + 1]?.dataset.title || 'End');
    document.querySelectorAll('[data-current-notes]').forEach((el) => el.innerHTML = slides[index]?.querySelector('.presso-slide-notes')?.innerHTML || '');
    document.querySelectorAll('[data-timing]').forEach((el) => el.textContent = slides[index]?.dataset.targetTime || '');
  }
  document.addEventListener('keydown', (event) => {
    if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); go(1); }
    if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); go(-1); }
    if (event.key === 'n') document.body.dataset.notesVisible = document.body.dataset.notesVisible === 'true' ? 'false' : 'true';
  });
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'next') go(1);
    if (action === 'prev') go(-1);
    if (action === 'notes') document.body.dataset.notesVisible = document.body.dataset.notesVisible === 'true' ? 'false' : 'true';
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
})();`;
}

function renderDocument(deck: Deck, mode: RenderMode, body: string, options: { server?: boolean } = {}): string {
  const themeHref = normalizeHref(deck.config.theme);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(deck.config.title)}</title>
  <style>${baseStyles(deck)}</style>
  <link rel="stylesheet" href="${themeHref}">
</head>
<body data-mode="${mode}" data-notes-visible="${deck.config.notes.public === 'visible' ? 'true' : 'false'}">
  ${body}
  <script>window.__PRESSO_SERVER__ = ${options.server ? 'true' : 'false'};</script>
  <script>${runtimeScript()}</script>
</body>
</html>`;
}

function renderDeck(deck: Deck, mode: RenderMode): string {
  if (mode === 'print-notes-side') {
    return `<main>${deck.slides.map((slide) => `<section class="presso-print-page">${renderSlide(slide)}<aside class="presso-print-notes">${slide.notesHtml}</aside></section>`).join('\\n')}</main>`;
  }
  if (mode === 'print-notes-pages') {
    return `<main>${deck.slides.map((slide) => `${renderSlide(slide)}<aside class="presso-print-notes"><h2>${escapeHtml(slide.title)}</h2>${slide.notesHtml}</aside>`).join('\\n')}</main>`;
  }
  return `<main class="presso-stage">${deck.slides.map(renderSlide).join('\\n')}</main><div class="presso-progress"><span></span></div>`;
}

function renderSlide(slide: Slide): string {
  const classNames = ['presso-slide', ...slide.class].join(' ');
  const style = slide.background ? ` style="background-image: url('${escapeAttr(slide.background)}'); background-size: ${escapeAttr(slide.backgroundFit ?? 'cover')};"` : '';
  const target = slide.targetTimeSeconds === undefined ? '' : secondsToClock(slide.targetTimeSeconds);
  return `<section class="${classNames}" data-slide-index="${slide.index}" data-slide-id="${escapeAttr(slide.id)}" data-title="${escapeAttr(slide.title)}" data-layout="${escapeAttr(slide.layout)}" data-target-time="${escapeAttr(target)}"${style}>
  <div class="presso-slide-body">${slide.bodyHtml}</div>
  <aside class="presso-slide-notes" hidden>${slide.notesHtml}</aside>
</section>`;
}

function renderNotesToggle(policy: NotesPublicPolicy): string {
  if (policy === false) return '';
  return `<button class="presso-notes-toggle" data-action="notes" type="button">Notes</button>`;
}

function renderPresenter(deck: Deck): string {
  return `<main class="presso-presenter">
  <section class="presso-preview">
    <h1 data-current-title></h1>
    ${renderDeck(deck, 'presenter')}
  </section>
  <section>
    <p>Next: <strong data-next-title></strong></p>
    <p>Target: <strong data-timing></strong></p>
    <div class="presso-controls"><button data-action="prev">Back</button><button data-action="next">Next</button><button data-action="font-minus">A-</button><button data-action="font-plus">A+</button></div>
    <article class="presso-notes" data-current-notes></article>
  </section>
</main>`;
}

function renderControl(deck: Deck): string {
  return `<main class="presso-control-page"><section><h1>${escapeHtml(deck.config.title)}</h1><p>${deck.slides.length} slides</p><button data-action="prev">Back</button><button data-action="next">Next</button></section></main>`;
}

function renderNotes(deck: Deck): string {
  if (deck.config.notes.public === false) {
    return '<main class="presso-notes-list"><h1>Notes are private</h1></main>';
  }
  return `<main class="presso-notes-list"><h1>${escapeHtml(deck.config.title)} Notes</h1>${deck.slides.map((slide) => `<section><h2>${escapeHtml(slide.title)}</h2>${slide.notesHtml}</section>`).join('\\n')}</main>`;
}

function renderTranscriptHtml(deck: Deck): string {
  return `<main class="presso-transcript"><h1>${escapeHtml(deck.config.title)}</h1>${deck.slides.map((slide) => `<section><h2>${escapeHtml(slide.title)}</h2>${slide.bodyHtml}${slide.notesHtml}</section>`).join('\\n')}</main>`;
}

function normalizeHref(value: string): string {
  return value.startsWith('.') ? value.slice(1) : value;
}

function secondsToClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
