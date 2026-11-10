<p align="center"><img src=".github/assets/icon.png" width="128" alt="Flowboard icon"></p>

<h1 align="center">Flowboard</h1>

<p align="center">Every screen of your app on one infinite, read-only canvas, straight from Storybook.</p>

## What it does

Flowboard compiles your stories with `storybook build`, serves the static bundle itself and lays out every story as a live screen on a dotted, pannable, zoomable canvas:

- one row per category (the story `title`, e.g. `Onboarding mobile`), with all its screens side by side;
- every screen rendered at the size of the selected device (the Chrome DevTools device list);
- read-only: screens are real renders of your code, but they never receive clicks or keyboard input;
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

## Canvas controls

| Action | Trackpad | Mouse / keyboard |
|---|---|---|
| Pan | two-finger scroll, or drag | drag with left, middle or right button, or wheel |
| Zoom | pinch | ⌘/Ctrl + wheel, `+` / `-` (10% steps) |
| 100% | | `0` |
| Fit all screens | | `1` |

## Requirements

Node 20+. No dependencies.
