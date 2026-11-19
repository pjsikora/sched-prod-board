import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4
const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');

const acked = new Map(); // incident id -> ackedAt (survives refreshes)
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

function renderAction(li) {
  const id = li.dataset.id;
  const slot = li.querySelector('.act');
  if (acked.has(id)) {
    li.classList.add('is-acked');
    slot.innerHTML = `<span data-testid="acked" class="acked">✓ acked</span>`;
  } else {
    slot.innerHTML = `<button data-testid="ack" type="button" ${pending.has(id) ? 'disabled' : ''}>Ack</button>`;
  }
}

// R1: keyed update — existing rows stay as they are, new incidents are inserted at the top (newest first).
function render(incidents) {
  const byId = new Map([...list.children].map((li) => [li.dataset.id, li]));
  const keep = new Set(incidents.map((i) => i.id));
  for (const [id, li] of byId) if (!keep.has(id)) li.remove();
  let prev = null;
  for (const i of incidents) {
    let li = byId.get(i.id);
    if (!li) {
      li = document.createElement('li');
      li.setAttribute('data-testid', 'incident-row');
      li.dataset.id = i.id;
      li.className = `row ${i.severity}`;
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

// R2: Ack sends api.ack(id) for the row clicked and marks that row acked.
list.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-testid="ack"]');
  if (!btn) return;
  const li = btn.closest('[data-testid="incident-row"]');
  const id = li.dataset.id;
  pending.add(id);
  btn.disabled = true;
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
  } catch (err) {
    console.error(err);
  } finally {
    pending.delete(id);
    renderAction(li);
  }
});

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
