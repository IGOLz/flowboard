// Injected by the Flowboard server into every story iframe. The iframe runs on another origin, in
// its own process, so the canvas only talks to it through messages. The screen takes left clicks,
// typing and scrolling like in Storybook; this script keeps the canvas gestures working over it:
// ⌘/Ctrl+wheel zooms and right/middle drag pans the canvas, and scrolling never leaks out of it.
(() => {
  const post = (message) => parent.postMessage({ flowboard: message.type, ...message }, '*');

  // Scrolling stops at the screen's edges instead of moving the canvas or swiping back in history.
  document.documentElement.style.overscrollBehavior = 'none';

  addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault(); // otherwise the browser zooms the whole page
    post({ type: 'zoom', x: event.clientX, y: event.clientY, deltaY: event.deltaY, deltaMode: event.deltaMode });
  }, { capture: true, passive: false });

  // Middle/right drag pans the canvas: hand the drag over to it. Pointer positions inside this
  // frame shift as the canvas moves it (and scale with the zoom), so the canvas tracks the drag
  // itself, with screens letting the pointer through until the button is released.
  addEventListener('pointerdown', (event) => {
    if (event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation(); // the app never sees canvas drags
    post({ type: 'grab' });
  }, true);
  addEventListener('mousedown', (event) => { if (event.button) event.preventDefault(); }, true); // no autoscroll or selection
  addEventListener('contextmenu', (event) => event.preventDefault(), true);

  // A story that focuses an input by itself (autofocus) must not steal the canvas shortcuts:
  // only focus that follows a click or key press in this screen stays here.
  addEventListener('focusin', () => {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) post({ type: 'unfocus' });
  });

  // Tell the canvas when the story has finished rendering (or failed), so it can start the next
  // screen: booting dozens of apps at once would saturate the CPU while the user pans.
  addEventListener('load', () => {
    const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
    const ready = () => post({ type: 'ready' });
    if (!channel) return ready();
    for (const name of ['storyRendered', 'storyErrored', 'storyThrewException', 'storyMissing']) channel.on(name, ready);
  });

  // Reset: forget what the user changed in the app's storage, so the reloaded screen starts clean.
  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.flowboard !== 'reset') return;
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    post({ type: 'reset' });
  });
})();
