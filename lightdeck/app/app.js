// Lightdeck web app: talks to the bridge it was served from.
const BRANDS = { gvm: { label: 'GVM', kelvin: [2700, 7500] }, viltrox: { label: 'Viltrox', kelvin: [2700, 6500] }, smallrig: { label: 'SmallRig', kelvin: [2700, 6500] } };
const root = document.getElementById('root');
const connEl = document.getElementById('conn');
const cards = new Map();
let lights = [];

const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

function sendDebounced(card, id, patch) {
  card.pending = { ...card.pending, ...patch };
  clearTimeout(card.timer);
  card.timer = setTimeout(() => { const p = card.pending; card.pending = {}; post(`/api/lights/${encodeURIComponent(id)}/state`, p).catch(() => setConn(false)); }, 120);
}

function slider(card, id, { key, label, min, max, step = 1, unit = '' }) {
  const wrap = document.createElement('label');
  wrap.innerHTML = `${label}<span></span><input type="range" min="${min}" max="${max}" step="${step}">`;
  const input = wrap.querySelector('input'), out = wrap.querySelector('span');
  input.addEventListener('input', () => { out.textContent = input.value + unit; sendDebounced(card, id, { [key]: Number(input.value) }); });
  card.sliders[key] = { input, out, unit };
  return wrap;
}

function build(l) {
  const brand = BRANDS[l.brand];
  const el = document.createElement('section'); el.className = 'card';
  const card = { el, sliders: {}, pending: {}, timer: null, id: l.id };
  el.innerHTML = `<div class="row"><div><div class="name"></div><div class="status"></div></div><button type="button" class="power" aria-pressed="false">Aus</button></div>
    <div class="tabs"><button type="button" data-mode="cct" aria-pressed="true">Weiss</button><button type="button" data-mode="hsi" aria-pressed="false">Farbe</button></div>
    <div class="pane-cct"></div><div class="pane-hsi hidden"></div>`;
  el.querySelector('.name').textContent = l.name;
  card.power = el.querySelector('.power');
  card.power.addEventListener('click', () => sendDebounced(card, l.id, { on: card.power.getAttribute('aria-pressed') !== 'true' }));
  el.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => sendDebounced(card, l.id, { mode: b.dataset.mode })));
  const bright = slider(card, l.id, { key: 'brightness', label: 'Helligkeit', min: 0, max: 100, unit: ' %' });
  el.insertBefore(bright, el.querySelector('.pane-cct'));
  el.querySelector('.pane-cct').append(slider(card, l.id, { key: 'kelvin', label: 'Farbtemperatur', min: brand.kelvin[0], max: brand.kelvin[1], step: 100, unit: ' K' }),
    slider(card, l.id, { key: 'tint', label: 'Grün / Magenta', min: -10, max: 10 }));
  const hsi = el.querySelector('.pane-hsi');
  hsi.append(slider(card, l.id, { key: 'hue', label: 'Farbton', min: 0, max: 359, unit: '°' }));
  const bar = document.createElement('div'); bar.id = ''; bar.style.cssText = 'height:8px;border-radius:4px;background:linear-gradient(90deg,red,yellow,lime,cyan,blue,magenta,red)'; hsi.append(bar);
  hsi.append(slider(card, l.id, { key: 'saturation', label: 'Sättigung', min: 0, max: 100, unit: ' %' }));
  if (l.brand === 'smallrig') { const n = document.createElement('p'); n.className = 'note'; n.textContent = 'SmallRig-Steuerung ist noch in Arbeit (Mesh).'; el.append(n); }
  cards.set(l.id, card);
  return el;
}

function update(l) {
  const c = cards.get(l.id); if (!c) return;
  const s = l.state;
  c.power.setAttribute('aria-pressed', String(s.on)); c.power.textContent = s.on ? 'An' : 'Aus'; c.power.classList.toggle('on', s.on);
  c.el.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode)));
  c.el.querySelector('.pane-cct').classList.toggle('hidden', s.mode !== 'cct');
  c.el.querySelector('.pane-hsi').classList.toggle('hidden', s.mode !== 'hsi');
  for (const [k, { input, out, unit }] of Object.entries(c.sliders)) {
    if (document.activeElement !== input) input.value = s[k];
    out.textContent = input.value + unit;
  }
  const st = c.el.querySelector('.status');
  st.className = 'status ' + (l.status.ok === false ? 'err' : l.status.ok ? 'ok' : '');
  st.textContent = l.status.ok === false ? l.status.error : l.status.ok ? 'gesendet' : 'noch nichts gesendet';
}

function setConn(ok) { connEl.textContent = ok ? 'Mit Bridge verbunden' : 'Bridge nicht erreichbar, versuche erneut ...'; connEl.classList.toggle('bad', !ok); }

async function init() {
  lights = await (await fetch('/api/lights')).json();
  root.replaceChildren();
  cards.clear();
  for (const brand of Object.keys(BRANDS)) {
    const group = lights.filter((l) => l.brand === brand); if (!group.length) continue;
    const h = document.createElement('h2'); h.textContent = BRANDS[brand].label;
    const grid = document.createElement('div'); grid.className = 'grid';
    group.forEach((l) => grid.append(build(l)));
    root.append(h, grid);
  }
  lights.forEach(update); setConn(true);
  const es = new EventSource('/api/events');
  es.onmessage = (e) => { setConn(true); update(JSON.parse(e.data)); };
  es.onerror = () => setConn(false);
}
document.getElementById('all-on').addEventListener('click', () => post('/api/all', { on: true }));
document.getElementById('all-off').addEventListener('click', () => post('/api/all', { on: false }));
init().catch(() => { setConn(false); setTimeout(init, 3000); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
