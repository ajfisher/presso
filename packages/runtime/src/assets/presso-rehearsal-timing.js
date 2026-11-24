export function setupTimingReview(dialog, deckId, slides, formatClock, requireReload) {
  const panel = dialog.querySelector('[data-timing-review]');
  const form = panel.querySelector('form');
  const fit = form.querySelector('[value="fit"]');
  const length = form.elements.namedItem('talk-length');
  const message = panel.querySelector('[role="status"]');
  const note = panel.querySelector('[data-timing-note]');
  const apply = panel.querySelector('[type="submit"]');
  let run;
  let rows;
  let plan;
  let request;
  let saving = false;
  const body = panel.querySelector('tbody');

  function show(nextRun) {
    request?.abort();
    plan = undefined;
    run = nextRun;
    form.reset();
    panel.hidden = !run;
    if (!run) return;
    message.textContent = '';
    form.querySelector('fieldset').disabled = false;
    body.replaceChildren();
    apply.disabled = true;
    if (slides.length !== run.slideIds.length || slides.some((slide, index) => slide.id !== run.slideIds[index])) {
      form.querySelector('fieldset').disabled = true;
      message.textContent = 'Reload the presenter on this deck’s current slide order to review targets.';
      return;
    }
    fit.disabled = !run.finishedMs;
    length.disabled = true;
    const visitsBySlide = new Map();
    const positions = new Map(run.slideIds.map((id, index) => [id, index]));
    let previousIndex = -1;
    let inOrder = true;
    for (const [index, visit] of run.visits.entries()) {
      const finish = run.visits[index + 1]?.startMs ?? run.finishedMs;
      const position = positions.get(visit.slideId);
      inOrder &&= position > previousIndex;
      previousIndex = position;
      if (!visitsBySlide.has(visit.slideId)) visitsBySlide.set(visit.slideId, []);
      visitsBySlide.get(visit.slideId).push(finish);
    }
    const fullRun = inOrder && run.finishedMs !== null
      && run.visits[0]?.slideId === run.slideIds[0]
      && run.visits.at(-1)?.slideId === run.slideIds.at(-1);
    const opening = run.visits[0];
    note.textContent = fullRun ? 'Targets are rounded to whole seconds.'
      : `Timing starts at 0:00 on ${opening?.title ?? 'the first recorded slide'}. Choose finishes from this partial or out-of-order run.`;
    rows = slides.map((slide) => makeRow(slide, visitsBySlide.get(slide.id) ?? [], fullRun, formatClock));
    body.replaceChildren(...rows.map(({ element }) => element));
    void refresh();
  }

  function getPayload() {
    const slot = fit.checked ? parseTalkLength(length.value) : null;
    if (fit.checked && !slot) throw new Error('Enter a talk length like 20:00.');
    const scale = slot ? slot * 1000 / run.finishedMs : 1;
    const targets = [];
    for (const row of rows) {
      if (row.select?.value) {
        targets.push({ id: row.id, seconds: Math.round(Number(row.select.value) * scale / 1000) });
      }
    }
    return { deckId, slideIds: run.slideIds, targets };
  }

  async function refresh() {
    request?.abort();
    request = new AbortController();
    const pending = request;
    apply.disabled = true;
    plan = undefined;
    try {
      const payload = getPayload();
      const preview = await timingRequest('POST', payload, pending.signal);
      if (pending.signal.aborted) return;
      plan = { ...preview, payload };
      for (const [index, row] of preview.rows.entries()) {
        const view = rows[index];
        const current = row.authored ?? (row.current === null ? '—' : `${formatClock(row.current * 1000)} (interpolated)`);
        view.current.textContent = current;
        view.proposed.textContent = row.change ?? (row.proposed === null ? '—' : formatClock(row.proposed * 1000));
        if (!row.change && row.authored === null && row.proposed !== null) {
          view.proposed.append(' (interpolated)');
        }
      }
      message.textContent = preview.conflict ?? '';
      apply.disabled = Boolean(preview.conflict) || !preview.rows.some((row) => row.change);
    } catch (error) {
      if (!pending.signal.aborted) message.textContent = error.message;
    }
  }

  form.addEventListener('change', (event) => {
    // The length field refreshes during input. Its later blur must not disable Apply.
    if (event.target === length) return;
    length.disabled = !fit.checked;
    void refresh();
  });

  length.addEventListener('input', () => void refresh());
  length.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.preventDefault();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!plan || apply.disabled || saving) return;
    if (JSON.stringify(getPayload()) !== JSON.stringify(plan.payload)) return void refresh();
    const runPicker = dialog.querySelector('[data-rehearsal-run]');
    runPicker.disabled = true;
    const { payload, revision } = plan;
    saving = true;
    const fieldset = form.querySelector('fieldset');
    fieldset.disabled = true;
    apply.disabled = true;
    try {
      const result = await timingRequest('PUT', { ...payload, revision });
      if (result.applied.length) requireReload();
      await refresh();
      message.textContent = result.error ?? `Saved ${result.applied.length} slide ${result.applied.length === 1 ? 'target' : 'targets'}.`;
      if (result.error && result.applied.length) {
        message.textContent = `Saved ${result.applied.length} targets. ${result.error}`;
      }
    } catch (error) {
      await refresh();
      message.textContent = error.message;
    } finally {
      fieldset.disabled = false;
      runPicker.disabled = false;
      saving = false;
    }
  });

  return { show };
}

function makeRow(slide, finishes, inOrder, formatClock) {
  const canSelect = finishes.some((finish) => finish !== null);
  const element = document.createElement('tr');
  const title = document.createElement('th');
  title.scope = 'row';
  title.textContent = slide.title;
  element.append(title);
  const measured = element.insertCell();
  let select;
  if (canSelect) {
    select = document.createElement('select');
    select.setAttribute('aria-label', `Choose finish for ${slide.title}`);
    select.add(new Option('No new marker', ''));
    finishes.forEach((ms, index) => {
      if (ms === null) return;
      const time = formatClock(Math.round(ms / 1000) * 1000);
      select.add(new Option(finishes.length > 1 ? `Visit ${index + 1} ended at ${time}` : time, String(ms)));
    });
    if (inOrder && finishes.length === 1) select.selectedIndex = 1;
    measured.append(select);
  } else {
    measured.textContent = finishes.length ? 'Visit unfinished' : 'Skipped';
  }
  const current = element.insertCell();
  const proposed = element.insertCell();
  return { id: slide.id, element, select, current, proposed };
}

function parseTalkLength(value) {
  const fields = value.trim().split(':');
  if (fields.length < 2 || fields.length > 3 || !/^\d+$/.test(fields[0])
    || fields.slice(1).some((field) => !/^[0-5]\d$/.test(field))) return 0;
  const seconds = fields.reduce((sum, field) => sum * 60 + Number(field), 0);
  return Number.isSafeInteger(seconds) ? seconds : 0;
}

async function timingRequest(method, value, signal) {
  const response = await fetch('/rehearsal/timing', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value), signal
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error);
  return payload;
}
