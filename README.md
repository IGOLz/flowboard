<p align="center"><img src=".github/assets/icon.png" width="128" alt="Flowboard icon"></p>

<h1 align="center">Flowboard</h1>

<p align="center">Every screen of your app on one infinite, read-only canvas, straight from Storybook.</p>

## What it does

Flowboard compiles your stories with `storybook build`, serves the static bundle itself and lays out every story as a live screen on a dotted, pannable, zoomable canvas:

- one row per category (the story `title`, e.g. `Onboarding mobile`), with all its screens side by side;
- stories that are states of the same screen collapse into one screen with ‹ › arrows to switch state;
- categories and screens are named by position, e.g. `1 Accesso` and `1.1 Welcome`; clicking a name copies its id (`1.accesso`, `1.1.welcome`);
- every screen rendered at the size of the selected device (the Chrome DevTools device list);
- screens are real renders of your code: tap, type and scroll in them as in Storybook, then ↺ resets the screen to how it first loaded (its storage too);
- nothing in the board itself can be edited;
- no Storybook dev server: when a source file changes, Flowboard rebuilds and the canvas refreshes by itself.

Works with any Storybook 7+ project, including React Native through `@storybook/react-native-web-vite`.

## Usage

Run it from the folder that contains your `.storybook` config:

```sh
npx flowboard --open    # dashboard on http://localhost:6007
```

| Option | Default | |
|---|---|---|
| `-p, --port <port>` | `6007` | Dashboard port |
| `-c, --config-dir <dir>` | `.storybook` | Storybook config folder |
| `--no-watch` | off | Build once, do not rebuild on changes |
| `-o, --open` | off | Open the dashboard in the browser |

Builds are cached in `node_modules/.cache/flowboard`, so the last build shows up at once while a fresh one runs.

Until it is published on npm, run it from a local checkout: `node /path/to/flowboard/bin/flowboard.js`.

## Screen states

Inside one category, stories collapse into a single screen when:

- they share a leading number: `02 · Home name` and `02 · Home name empty`;
- or one name is another plus a state word: `Dashboard` and `Dashboard Empty`, `Loading`, `Error`… (see `STATE_WORDS` in [dashboard/screens.js](dashboard/screens.js)).

`Create` and `Create Rooms` stay two screens: `Rooms` is not a state word.

Names and ids follow the story order: they change when stories are added or reordered. Storybook's own story id (e.g. `accesso--welcome`) stays stable.

## Canvas controls

| Action | Trackpad | Mouse / keyboard |
|---|---|---|
| Pan | two-finger scroll, or drag on the empty canvas | drag the empty canvas, or drag with the middle or right button anywhere, or wheel |
| Use a screen | click, type, two-finger scroll over it | click, type, wheel over it |
| Reset a screen | | ↺ next to its name |
| Zoom | pinch | ⌘/Ctrl + wheel, `+` / `-` (10% steps) |
| 100% | | `0` |
| Fit all screens | | `1` |

Scrolling a screen stops at its top and bottom, without moving the canvas. A screen that focuses an input by itself does not take the keyboard; one you clicked into keeps it until you click the canvas.

## How it works

- Screens are iframes of the static Storybook bundle, served from the other loopback name (`127.0.0.1` when the dashboard is on `localhost`). Being another site, they run in a separate browser process, so their JavaScript never stalls panning and zooming.
- [dashboard/frame.js](dashboard/frame.js) is injected into every screen. It reports when a story has rendered, so screens boot four at a time; hands ⌘/Ctrl+wheel zooms and middle/right drags begun over the screen to the canvas; and clears the screen's storage on reset.
- Each state of a screen is its own iframe, stacked in the same frame. A state is shown only once it has rendered, so switching never flashes blank, and switching back is instant. Reset loads a fresh iframe underneath the same way.
- The server only answers `localhost` / `127.0.0.1` requests from this machine.

## Requirements

Node 20+. No dependencies. Tests: `npm test`.
