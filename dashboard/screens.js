// Groups Storybook stories into categories (story title) and screens; stories that are states
// of the same screen collapse into one screen with several states.
//
// Two stories are states of the same screen when, inside the same title:
// - they share a leading number: "02 · Home name" and "02 · Home name empty";
// - or one name is another plus a state word: "Dashboard" and "Dashboard Empty".

const STATE_WORDS = new Set([
  'empty', 'loading', 'error', 'errors', 'failed', 'failure', 'success', 'denied', 'granted',
  'disabled', 'offline', 'expired', 'invalid', 'filled', 'partial', 'skeleton', 'pending',
  'blocked', 'locked', 'unauthorized', 'long', 'dark', 'light', 'selected', 'open', 'closed',
  'done', 'completed', 'active', 'inactive', 'default',
]);
// "02 · Name", "02: Name", "02. Name", "02 - Name"; not "3-day forecast" or "1-Tap Login".
const NUMBERED = /^(\d+)\s*(?:[·•:]|\.(?=\s)|\s[-–—](?=\s))/;

function stateLabel(name, base) {
  const rest = name.startsWith(`${base} `) ? name.slice(base.length + 1) : name;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function screenKey(story, names) {
  const number = NUMBERED.exec(story.name);
  if (number) return `#${number[1]}`;
  const words = story.name.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const base = words.slice(0, i).join(' ');
    if (STATE_WORDS.has(words[i].toLowerCase()) && names.has(base)) return base;
  }
  return story.name;
}

/** @returns {Map<string, {key: string, name: string, states: {id: string, label: string}[]}[]>} */
export function groupScreens(stories) {
  const byTitle = new Map();
  for (const story of stories) {
    if (!byTitle.has(story.title)) byTitle.set(story.title, []);
    byTitle.get(story.title).push(story);
  }

  const categories = new Map();
  for (const [title, list] of byTitle) {
    const names = new Set(list.map((story) => story.name));
    const groups = new Map(); // key → stories, in first-seen order
    for (const story of list) {
      const key = screenKey(story, names);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(story);
    }
    categories.set(title, [...groups].map(([key, stories]) => {
      // The base is the named screen, or for numbered groups the shortest name ("02 · Home name"
      // rather than "02 · Home name empty"), whatever order the stories come in.
      const name = key.startsWith('#') || !names.has(key)
        ? stories.reduce((a, b) => (b.name.length < a.name.length ? b : a)).name
        : key;
      const states = stories.map((story) => ({ id: story.id, label: story.name === name ? 'Default' : stateLabel(story.name, name) }));
      states.sort((a, b) => (b.label === 'Default') - (a.label === 'Default')); // default first
      return { key: `${title}\u0000${key}`, name, states };
    }));
  }
  return categories;
}
