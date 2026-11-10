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

// "Attività / Casa e stanze" → "attivita-casa-e-stanze"
function slug(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

/**
 * Categories in story order. Each category and screen is named by its position, and that name
 * doubles as its id: category "1 Accesso" (id "1.accesso"), screens "1.1 Welcome"
 * (id "1.1.welcome"), "2.2 Home name" (id "2.2.home-name"; a leading "02 ·" is dropped).
 * @returns {{id: string, label: string, title: string, screens: {id: string, label: string, key: string, name: string, states: {id: string, label: string}[]}[]}[]}
 */
export function groupScreens(stories) {
  const byTitle = new Map();
  for (const story of stories) {
    if (!byTitle.has(story.title)) byTitle.set(story.title, []);
    byTitle.get(story.title).push(story);
  }

  return [...byTitle].map(([title, list], c) => {
    const names = new Set(list.map((story) => story.name));
    const groups = new Map(); // key → stories, in first-seen order
    for (const story of list) {
      const key = screenKey(story, names);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(story);
    }
    const categoryTitle = title.split('/').join(' / ');
    const screens = [...groups].map(([key, stories], s) => {
      // The base is the named screen, or for numbered groups the shortest name ("02 · Home name"
      // rather than "02 · Home name empty"), whatever order the stories come in.
      const name = key.startsWith('#') || !names.has(key)
        ? stories.reduce((a, b) => (b.name.length < a.name.length ? b : a)).name
        : key;
      const states = stories.map((story) => ({ id: story.id, label: story.name === name ? 'Default' : stateLabel(story.name, name) }));
      states.sort((a, b) => (b.label === 'Default') - (a.label === 'Default')); // default first
      const plain = name.replace(NUMBERED, '').trim();
      return {
        id: `${c + 1}.${s + 1}.${slug(plain)}`,
        label: `${c + 1}.${s + 1} ${plain}`,
        key: `${title}\u0000${key}`,
        name,
        states,
      };
    });
    return { id: `${c + 1}.${slug(categoryTitle)}`, label: `${c + 1} ${categoryTitle}`, title, screens };
  });
}
