// Flowboard dashboard: an infinite, read-only canvas of Storybook stories grouped by title.
import { groupScreens } from './screens.js';

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
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const GRID = 24;
const POLL_MS = 2000;
const WHEEL_GESTURE_MS = 200;

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const dots = $('dots');
const world = $('world');
const view = { x: 0, y: 0, z: 1 };
let frameOrigin = location.origin;
let signature = '';
let fitted = false;
const selectedState = new Map(); // screen key → state index, kept across rebuilds

// ---------- Persistence (per-viewer convenience only) ----------
const store = {
  get(key) { try { return localStorage.getItem(`flowboard:${key}`); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`flowboard:${key}`, value); } catch {} },
};

// ---------- Camera ----------
// Input events only update `view`; the DOM is written at most once per frame, and only with
// compositor-friendly transforms (no background repaints, no layout).
let pending = false;
let lastGrid = 0;
let lastZoom = 0;
let lastZoomLabel = '';
let sharpenTimer;

function applyView() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    // The world stays on its own compositor layer (will-change in CSS), so panning never repaints.
    // Such layers keep the raster scale they had, so once a zoom settles, drop and restore the hint
    // for one frame to re-rasterize text sharp at the new scale.
    if (view.z !== lastZoom) {
      lastZoom = view.z;
      clearTimeout(sharpenTimer);
      sharpenTimer = setTimeout(() => {
        world.style.willChange = 'auto';
        requestAnimationFrame(() => { world.style.willChange = ''; });
      }, 300);
    }

    let grid = GRID * view.z;
    while (grid < 12) grid *= 2; // keep the dots readable when zoomed far out
    if (grid !== lastGrid) {
      dots.style.backgroundSize = `${grid}px ${grid}px`;
      lastGrid = grid;
    }
    const mod = (n) => ((n % grid) + grid) % grid;
    dots.style.transform = `translate(${mod(view.x) - grid}px, ${mod(view.y) - grid}px)`;
    const label = `${Math.round(view.z * 100)}%`;
    if (label !== lastZoomLabel) $('zoom-reset').textContent = lastZoomLabel = label;
  });
}

function pan(dx, dy) {
  view.x -= dx;
  view.y -= dy;
  applyView();
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

// Next multiple of 10% in the given direction, e.g. 30% → 40%, 33% → 40% or 30%.
function zoomStep(direction, cx, cy) {
  const tens = view.z * 10;
  const next = direction > 0 ? Math.floor(tens + 1e-6) + 1 : Math.ceil(tens - 1e-6) - 1;
  zoomTo(next / 10, cx, cy);
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

// ---------- Wheel: zoom, pan, or scroll inside a screen ----------
// A wheel gesture sticks to where it started: begun on the canvas it pans (even across screens),
// begun on a screen it scrolls that screen, and pans the canvas once the screen cannot scroll further.
let wheelTarget = null;
let wheelTimer;

viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
  if (event.ctrlKey || event.metaKey) {
    // Mouse wheel notches (line mode or ~100px deltas) step the zoom by exactly 10 points;
    // trackpad pinch sends small pixel deltas and zooms smoothly.
    const notch = event.deltaMode !== 0 || Math.abs(event.deltaY) >= 50;
    if (notch && event.deltaY) zoomStep(-Math.sign(event.deltaY), event.clientX, event.clientY);
    else zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
    return;
  }

  const dx = event.deltaX * unit;
  const dy = event.deltaY * unit;
  if (!wheelTarget) wheelTarget = event.target.closest?.('.frame.loaded') ?? 'canvas';
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheelTarget = null; }, WHEEL_GESTURE_MS);

  const iframe = wheelTarget !== 'canvas' && wheelTarget.isConnected && wheelTarget.querySelector('iframe');
  if (!iframe?.contentWindow) return pan(dx, dy);
  forwardScroll(iframe, wheelTarget, event.clientX, event.clientY, dx, dy);
}, { passive: false });

// Wheel deltas for a screen are summed and sent once per frame, so a busy screen gets one
// message per frame instead of one per wheel event.
let scrollOut = null;

function forwardScroll(iframe, frame, clientX, clientY, dx, dy) {
  if (scrollOut && scrollOut.iframe !== iframe) flushScroll();
  if (!scrollOut) {
    scrollOut = { iframe, frame, clientX, clientY, dx: 0, dy: 0 };
    requestAnimationFrame(flushScroll);
  }
  scrollOut.dx += dx;
  scrollOut.dy += dy;
}

let scrolledWindow = null;

function flushScroll() {
  if (!scrollOut) return;
  const { iframe, frame, clientX, clientY, dx, dy } = scrollOut;
  scrollOut = null;
  if (!iframe.isConnected || !iframe.contentWindow) return pan(dx, dy);
  const rect = frame.getBoundingClientRect();
  scrolledWindow = iframe.contentWindow;
  scrolledWindow.postMessage({
    flowboard: 'scroll',
    x: (clientX - rect.left) / view.z,
    y: (clientY - rect.top) / view.z,
    dx: dx / view.z,
    dy: dy / view.z,
    screenDx: dx,
    screenDy: dy,
  }, frameOrigin);
}

// A screen that cannot scroll further hands the movement back to the canvas.
addEventListener('message', (event) => {
  if (event.origin !== frameOrigin || event.source !== scrolledWindow || event.data?.flowboard !== 'unscrolled') return;
  const { dx, dy } = event.data;
  if (Number.isFinite(dx) && Number.isFinite(dy)) pan(dx, dy);
});

// ---------- Drag: left, middle (wheel) and right button all pan the canvas ----------
viewport.addEventListener('contextmenu', (event) => event.preventDefault());
let lastPointer = null;
viewport.addEventListener('pointerdown', (event) => {
  if (event.button > 2 || event.target.closest('button')) return;
  event.preventDefault(); // no text selection or middle-click autoscroll while panning
  viewport.focus({ preventScroll: true }); // e.g. leave the device menu, so shortcuts work again
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('dragging');
  lastPointer = { x: event.clientX, y: event.clientY };
});
viewport.addEventListener('pointermove', (event) => {
  if (!viewport.hasPointerCapture(event.pointerId) || !lastPointer) return;
  pan(lastPointer.x - event.clientX, lastPointer.y - event.clientY);
  lastPointer = { x: event.clientX, y: event.clientY };
});
const endDrag = () => viewport.classList.remove('dragging');
viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);

// Screens are read-only: when one grabs keyboard focus (e.g. an autofocused input),
// take it back so canvas shortcuts keep working.
addEventListener('blur', () => setTimeout(() => {
  if (!(document.activeElement instanceof HTMLIFrameElement)) return;
  document.activeElement.blur();
  viewport.focus({ preventScroll: true });
}));

addEventListener('keydown', (event) => {
  // Leave browser shortcuts (⌘−, ⌘0, ⌘1…) and the device menu alone.
  if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLSelectElement) return;
  if (event.key === '+' || event.key === '=') zoomStep(1);
  else if (event.key === '-') zoomStep(-1);
  else if (event.key === '0') zoomTo(1);
  else if (event.key === '1') fit();
});
$('zoom-in').onclick = () => zoomStep(1);
$('zoom-out').onclick = () => zoomStep(-1);
$('zoom-reset').onclick = () => zoomTo(1);
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
// Iframes load only once they come near the visible area, then stay loaded. At most a few boot
// at once, each slot freed when its story has rendered ('ready' from frame.js): dozens of apps
// booting together exhaust the browser's request slots (net::ERR_INSUFFICIENT_RESOURCES) and
// saturate the CPU while the user pans.
const MAX_LOADING = 4;
const LOAD_TIMEOUT_MS = 15000;
const loadQueue = [];
const loading = new Map(); // iframe → release()

function pumpLoads() {
  while (loading.size < MAX_LOADING && loadQueue.length) {
    const iframe = loadQueue.shift();
    if (!iframe.isConnected || iframe.src) continue;
    const timer = setTimeout(() => release(), LOAD_TIMEOUT_MS);
    const release = () => {
      clearTimeout(timer);
      if (loading.delete(iframe)) pumpLoads();
    };
    loading.set(iframe, release);
    iframe.src = iframe.dataset.src;
  }
}

addEventListener('message', (event) => {
  if (event.origin !== frameOrigin || event.data?.flowboard !== 'ready') return;
  for (const [iframe, release] of loading) if (iframe.contentWindow === event.source) release();
});

const lazy = new IntersectionObserver((items) => {
  for (const item of items) {
    if (!item.isIntersecting) continue;
    loadQueue.push(item.target.querySelector('iframe'));
    lazy.unobserve(item.target);
  }
  pumpLoads();
}, { rootMargin: '400px' });

function el(tag, attrs = {}, ...children) {
  const node = Object.assign(document.createElement(tag), attrs);
  node.append(...children);
  return node;
}

const storyUrl = (id) => `${frameOrigin}/storybook/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`;

function renderScreen(screen) {
  let index = Math.min(selectedState.get(screen.key) ?? 0, screen.states.length - 1);
  const iframe = el('iframe', { title: screen.name, tabIndex: -1 });
  iframe.dataset.src = storyUrl(screen.states[index].id);
  const frame = el('div', { className: 'frame' }, iframe);
  iframe.onload = () => iframe.src && frame.classList.add('loaded'); // not the initial about:blank
  lazy.observe(frame);

  const caption = el('figcaption', {}, el('span', { className: 'name', textContent: screen.name }));
  if (screen.states.length > 1) {
    const label = el('span', { className: 'state' });
    const show = (next) => {
      index = (next + screen.states.length) % screen.states.length;
      selectedState.set(screen.key, index);
      const { id, label: name } = screen.states[index];
      label.textContent = `${name} · ${index + 1}/${screen.states.length}`;
      iframe.dataset.src = storyUrl(id);
      // Loaded screens switch story in place; a screen still loading restarts on the new URL;
      // a queued one picks it up when its turn comes.
      if (frame.classList.contains('loaded')) iframe.contentWindow?.postMessage({ flowboard: 'story', id }, frameOrigin);
      else if (iframe.src) iframe.src = iframe.dataset.src;
    };
    caption.append(el('span', { className: 'states' },
      el('button', { className: 'prev', title: 'Previous state', textContent: '‹', onclick: () => show(index - 1) }),
      label,
      el('button', { className: 'next', title: 'Next state', textContent: '›', onclick: () => show(index + 1) }),
    ));
    show(index);
  }
  return el('figure', { className: 'screen' }, caption, frame);
}

function render(stories) {
  lazy.disconnect();
  loadQueue.length = 0;
  loading.clear();
  world.replaceChildren(...[...groupScreens(stories)].map(([title, screens]) => el('section', { className: 'category' },
    el('h2', {}, title.split('/').join(' / '), el('small', {}, `${screens.length} ${screens.length === 1 ? 'screen' : 'screens'}`)),
    el('div', { className: 'row' }, ...screens.map(renderScreen)),
  )));
}

function setStatus(text, kind) {
  const status = $('status');
  status.textContent = text;
  status.className = `status ${kind}`;
}

function showEmpty(text) {
  $('empty').hidden = !text;
  $('empty').textContent = text ?? '';
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
  frameOrigin = data.frameOrigin ?? location.origin;
  const count = `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`;
  const updated = build ? new Date(Number(build)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  if (error) setStatus(error, 'error');
  else if (building) setStatus(build ? `Updating… · ${count}` : 'Building stories…', 'busy');
  else setStatus(`${count} · updated ${updated}`, 'ok');

  if (!build) return showEmpty(building ? 'Building your stories for the first time…' : null);
  showEmpty(stories.length ? null : 'Your Storybook has no stories yet.');
  // A new build re-renders every screen, so code changes show up without reloading the page.
  const next = JSON.stringify([build, frameOrigin, stories.map((s) => [s.id, s.title, s.name])]);
  if (next === signature) return;
  signature = next;
  render(stories);
  if (!fitted) { fit(); fitted = true; }
}

applyView();
refresh();
setInterval(refresh, POLL_MS);
