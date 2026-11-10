// Injected by the Flowboard server into every story iframe. The canvas never touches the screen
// directly (the iframe runs on another origin, in its own process); it sends commands instead:
// - scroll: scroll the element under the pointer, or answer "unscrolled" so the canvas pans;
// - story: switch to another story (a state of the same screen) without reloading.
(() => {
  const SCROLLABLE = /(auto|scroll|overlay)/;

  function scrollAt({ x, y, dx, dy }) {
    const root = document.scrollingElement ?? document.documentElement;
    for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
      const style = getComputedStyle(el);
      // The root scrolls unless the app locked it with overflow: hidden.
      const scrollsY = el === root ? style.overflowY !== 'hidden' : SCROLLABLE.test(style.overflowY);
      const scrollsX = el === root ? style.overflowX !== 'hidden' : SCROLLABLE.test(style.overflowX);
      const canY = dy && scrollsY && el.scrollHeight > el.clientHeight;
      const canX = dx && scrollsX && el.scrollWidth > el.clientWidth;
      if (!canX && !canY) continue;
      const top = el.scrollTop;
      const left = el.scrollLeft;
      el.scrollBy({ left: dx, top: dy, behavior: 'instant' });
      if (el.scrollTop !== top || el.scrollLeft !== left) return true; // at an edge: try the parent
    }
    return false;
  }

  // Tell the canvas when the story has finished rendering (or failed), so it can start the next
  // screen: booting dozens of apps at once would saturate the CPU while the user pans.
  addEventListener('load', () => {
    const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
    const ready = () => parent.postMessage({ flowboard: 'ready' }, '*');
    if (!channel) return ready();
    for (const name of ['storyRendered', 'storyErrored', 'storyThrewException', 'storyMissing']) channel.on(name, ready);
  });

  addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== parent || !message || typeof message.flowboard !== 'string') return;
    if (message.flowboard === 'scroll' && !scrollAt(message)) {
      parent.postMessage({ flowboard: 'unscrolled', dx: message.screenDx, dy: message.screenDy }, event.origin);
    }
    if (message.flowboard === 'story' && typeof message.id === 'string') {
      const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
      if (channel) channel.emit('setCurrentStory', { storyId: message.id, viewMode: 'story' });
      else location.replace(`?id=${encodeURIComponent(message.id)}&viewMode=story`);
    }
  });
})();
