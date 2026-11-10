// Flowboard dashboard: an infinite, read-only canvas of Storybook stories grouped by title.

// Same devices and groups that Chrome DevTools shows by default in device mode (portrait sizes).
const DEVICE_GROUPS = [
  ['Mobile', [
    ['iPhone SE', 375, 667],
    ['iPhone 16', 393, 852],
    ['iPhone 16 Pro Max', 440, 956],
    ['Pixel 9', 412, 924],
    ['Pixel 9 Pro', 427, 952],
    ['Pixel 10', 412, 924],
    ['Samsung Galaxy A55', 360, 800],
  ]],
  ['Foldables', [
    ['Pixel 9 Pro Fold', 412, 922],
    ['Galaxy Z Fold 6', 412, 968],
  ]],
  ['Tablets & Desktops', [
    ['iPad Mini', 768, 1024],
    ['iPad Pro 13', 1032, 1376],
    ['Surface Pro 10', 960, 1440],
  ]],
  ['Smart Displays', [
    ['Nest Hub Max', 1280, 800],
  ]],
];
const DEVICES = DEVICE_GROUPS.flatMap(([, list]) => list.map(([name, w, h]) => ({ name, w, h })));
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const GRID = 24;
const POLL_MS = 2000;

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const world = $('world');
const view = { x: 0, y: 0, z: 1 };
let signature = '';
let fitted = false;

// ---------- Persistence (per-viewer convenience only) ----------
const store = {
  get(key) { try { return localStorage.getItem(`flowboard:${key}`); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`flowboard:${key}`, value); } catch {} },
};

// ---------- Camera ----------
function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  let grid = GRID * view.z;
  while (grid < 12) grid *= 2; // keep the dots readable when zoomed far out
  viewport.style.backgroundSize = `${grid}px ${grid}px`;
  viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
  $('zoom-reset').textContent = `${Math.round(view.z * 100)}%`;
}

function zoomAt(factor, cx, cy) {
  zoomTo(view.z * factor, cx, cy);
}

function zoomTo(target, cx = innerWidth / 2, cy = innerHeight / 2) {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target));
  view.x = cx - (cx - view.x) * (z / view.z);
  view.y = cy - (cy - view.y) * (z / view.z);
  view.z = z;
  applyView();
}

// ±10 percentage points, e.g. 30% → 40%.
function zoomStep(direction, cx, cy) {
  zoomTo(Math.round(view.z * 100 + direction * 10) / 100, cx, cy);
}

function fit() {
  const w = world.offsetWidth;
  const h = world.offsetHeight;
  if (!w || !h) return;
  const top = 96; // leave room for the toolbar
  const pad = 64;
  const z = Math.min(1, (innerWidth - pad * 2) / w, (innerHeight - top - pad) / h);
  view.z = Math.max(0.1, Math.floor(z * 10) / 10); // round down to a multiple of 10%
  view.x = (innerWidth - w * view.z) / 2;
  view.y = top + Math.max(0, (innerHeight - top - pad - h * view.z) / 2);
  applyView();
}

// Trackpad: two-finger scroll pans, pinch (ctrlKey) zooms. Mouse: wheel pans, ⌘/Ctrl + wheel zooms.
viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : 1;
  if (event.ctrlKey || event.metaKey) {
    // Mouse wheel notches (line mode or ~100px deltas) step the zoom by exactly 10 points;
    // trackpad pinch sends small pixel deltas and zooms smoothly.
    const notch = event.deltaMode !== 0 || Math.abs(event.deltaY) >= 50;
    if (notch) zoomStep(-Math.sign(event.deltaY), event.clientX, event.clientY);
    else zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
  } else {
    view.x -= event.deltaX * unit;
    view.y -= event.deltaY * unit;
    applyView();
  }
}, { passive: false });

// Left, middle (wheel) and right button all pan the canvas.
viewport.addEventListener('contextmenu', (event) => event.preventDefault());
viewport.addEventListener('pointerdown', (event) => {
  if (event.button > 2) return;
  event.preventDefault(); // no text selection or middle-click autoscroll while panning
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('dragging');
});
viewport.addEventListener('pointermove', (event) => {
  if (!viewport.hasPointerCapture(event.pointerId)) return;
  view.x += event.movementX;
  view.y += event.movementY;
  applyView();
});
const endDrag = () => viewport.classList.remove('dragging');
viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);

addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLSelectElement) return;
  if (event.key === '+' || event.key === '=') zoomStep(1);
  else if (event.key === '-') zoomStep(-1);
  else if (event.key === '0') zoomAt(1 / view.z);
  else if (event.key === '1') fit();
});
$('zoom-in').onclick = () => zoomStep(1);
$('zoom-out').onclick = () => zoomStep(-1);
$('zoom-reset').onclick = () => zoomAt(1 / view.z);
$('fit').onclick = fit;

// ---------- Device ----------
const select = $('device');
select.innerHTML = DEVICE_GROUPS.map(([group, list]) => `<optgroup label="${group}">${
  list.map(([name, w, h]) => `<option value="${name}" title="${w}×${h}">${name}</option>`).join('')}</optgroup>`).join('');
select.value = DEVICES.some((d) => d.name === store.get('device')) ? store.get('device') : 'iPhone SE';

function applyDevice() {
  const device = DEVICES.find((d) => d.name === select.value);
  world.style.setProperty('--device-w', `${device.w}px`);
  world.style.setProperty('--device-h', `${device.h}px`);
  store.set('device', device.name);
}
select.onchange = () => { applyDevice(); fit(); };
applyDevice();

// ---------- Screens ----------
// Iframes load only once they come near the visible area, then stay loaded.
const lazy = new IntersectionObserver((items) => {
  for (const item of items) {
    if (!item.isIntersecting) continue;
    const iframe = item.target.querySelector('iframe');
    iframe.src = iframe.dataset.src;
    lazy.unobserve(item.target);
  }
}, { rootMargin: '400px' });

function el(tag, attrs = {}, ...children) {
  const node = Object.assign(document.createElement(tag), attrs);
  node.append(...children);
  return node;
}

function render(stories) {
  const categories = new Map();
  for (const story of stories) {
    if (!categories.has(story.title)) categories.set(story.title, []);
    categories.get(story.title).push(story);
  }

  lazy.disconnect();
  world.replaceChildren(...[...categories].map(([title, items]) => el('section', { className: 'category' },
    el('h2', {}, title.split('/').join(' / '), el('small', {}, `${items.length} ${items.length === 1 ? 'screen' : 'screens'}`)),
    el('div', { className: 'row' }, ...items.map((story) => {
      const iframe = el('iframe', { title: `${title} – ${story.name}`, tabIndex: -1 });
      iframe.dataset.src = `/storybook/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`;
      const frame = el('div', { className: 'frame' }, iframe);
      iframe.onload = () => frame.classList.add('loaded');
      lazy.observe(frame);
      return el('figure', { className: 'screen' }, el('figcaption', {}, story.name), frame);
    })),
  )));
}

function setStatus(text, kind) {
  const status = $('status');
  status.textContent = text;
  status.className = `status ${kind}`;
}

function showEmpty(html) {
  $('empty').hidden = !html;
  $('empty').innerHTML = html ?? '';
}

// The CLI compiles the stories into a static bundle and serves it under /storybook/.
async function refresh() {
  let data;
  try {
    data = await (await fetch('/api/stories')).json();
  } catch {
    setStatus('Flowboard is not running', 'error');
    return;
  }
  const { stories, build, building, error } = data;
  const updated = build ? new Date(Number(build)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  if (error) setStatus(error, 'error');
  else if (building) setStatus(build ? `Updating… · ${stories.length} screens` : 'Building stories…', 'busy');
  else setStatus(`${stories.length} screens · updated ${updated}`, 'ok');

  if (!build) return showEmpty(building ? 'Building your stories for the first time…' : null);
  showEmpty(stories.length ? null : 'Your Storybook has no stories yet.');
  // A new build re-renders every screen, so code changes show up without reloading the page.
  const next = JSON.stringify([build, stories.map((s) => [s.id, s.title, s.name])]);
  if (next === signature) return;
  signature = next;
  render(stories);
  if (!fitted) { fit(); fitted = true; }
}

applyView();
refresh();
setInterval(refresh, POLL_MS);
