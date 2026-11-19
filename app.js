import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4
const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

const acked = new Map(); // incident id -> ackedAt (survives refreshes)
const incidentsById = new Map(); // latest data per incident id
let selected = null; // incident id the panel is bound to — never a list position
const pending = new Set();

// R5: viewer's local time zone and locale order (en-GB/de-DE → dd/mm, en-US → mm/dd).
const fmt = new Intl.DateTimeFormat(navigator.languages?.[0] || navigator.language, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const localTime = (iso) => fmt.format(new Date(iso));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function rowHtml(i) {
  return `<span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}" title="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
    <span class="act"></span>`;
}

// Product decision (after step 1): Ack leaves the row. A row only shows its acked mark.
function renderAction(li) {
  const id = li.dataset.id;
  const slot = li.querySelector('.act');
  if (acked.has(id)) {
    li.classList.add('is-acked');
    slot.innerHTML = `<span data-testid="acked" class="acked">✓ acked</span>`;
  } else {
    slot.innerHTML = `<span class="open-hint">Open ›</span>`;
  }
}

// R1: keyed update — existing rows stay as they are, new incidents are inserted at the top (newest first).
function render(incidents) {
  const byId = new Map([...list.children].map((li) => [li.dataset.id, li]));
  const keep = new Set(incidents.map((i) => i.id));
  for (const [id, li] of byId) if (!keep.has(id)) li.remove();
  let prev = null;
  for (const i of incidents) {
    incidentsById.set(i.id, i);
    let li = byId.get(i.id);
    if (!li) {
      li = document.createElement('li');
      li.setAttribute('data-testid', 'incident-row');
      li.dataset.id = i.id;
      li.className = `row ${i.severity}`;
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', `Open ${i.id}`);
      li.innerHTML = rowHtml(i);
      renderAction(li);
    } else {
      const t = li.querySelector('time');
      if (t.getAttribute('datetime') !== i.openedAt) {
        t.setAttribute('datetime', i.openedAt);
        t.title = i.openedAt;
        t.textContent = localTime(i.openedAt);
      }
    }
    const want = prev ? prev.nextSibling : list.firstChild;
    if (li !== want) list.insertBefore(li, want);
    prev = li;
  }
  empty.hidden = incidents.length > 0;
  list.hidden = incidents.length === 0;
}

// R2 (revised): a row opens its incident panel; Ack lives in the panel and acks the incident the panel names.
const panelSlot = document.querySelector('[data-testid="panel-slot"]');

function renderPanel() {
  if (!selected) { panelSlot.innerHTML = ''; return; }
  const i = incidentsById.get(selected);
  const id = selected;
  const done = acked.has(id);
  panelSlot.innerHTML = `<section data-testid="incident-panel" data-id="${esc(id)}" class="panel ${esc(i.severity)}" aria-label="Incident ${esc(id)}">
      <header><h2>${esc(id)}</h2><button type="button" class="close" aria-label="Close panel">×</button></header>
      <dl>
        <dt>Severity</dt><dd class="sev">${esc(i.severity)}</dd>
        <dt>Service</dt><dd>${esc(i.service)}</dd>
        <dt>Region</dt><dd>${esc(i.region)}</dd>
        <dt>Summary</dt><dd>${esc(i.summary)}</dd>
        <dt>Opened</dt><dd><time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time></dd>
      </dl>
      ${done
        ? `<p class="acked">✓ ${esc(id)} acked</p>`
        : `<button data-testid="panel-ack" type="button" class="primary" ${pending.has(id) ? 'disabled' : ''}>Ack ${esc(id)}</button>`}
    </section>`;
  panelSlot.querySelector('.close').onclick = () => select(null);
  panelSlot.querySelector('[data-testid="panel-ack"]')?.addEventListener('click', () => ackSelected(id));
}

function select(id) {
  selected = id;
  for (const li of list.children) li.classList.toggle('is-selected', li.dataset.id === id);
  renderPanel();
}

async function ackSelected(id) {
  if (acked.has(id) || pending.has(id)) return;
  pending.add(id);
  renderPanel();
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
  } catch (err) {
    console.error(err);
  } finally {
    pending.delete(id);
    const li = list.querySelector(`[data-testid="incident-row"][data-id="${CSS.escape(id)}"]`);
    if (li) renderAction(li);
    if (selected === id) renderPanel();
  }
}

list.addEventListener('click', (e) => {
  const li = e.target.closest('[data-testid="incident-row"]');
  if (li) select(li.dataset.id);
});
list.addEventListener('keydown', (e) => {
  const li = e.target.closest('[data-testid="incident-row"]');
  if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(li.dataset.id); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) select(null); });

let loaded = false;
async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    if (!loaded) {
      loaded = true;
      loader.remove(); // R3: gone once incidents load
      board.setAttribute('aria-busy', 'false');
    }
  } catch (err) {
    console.error(err);
  } finally {
    setTimeout(tick, REFRESH_MS); // R4
  }
}
tick();
