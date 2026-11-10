<p align="center">
  <a href="https://www.npmjs.com/package/@igol/flowboard"><img src="https://img.shields.io/npm/v/%40igol%2Fflowboard?style=for-the-badge&label=npm&color=6366F1&labelColor=ececec" alt="npm version"></a>
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=000000&labelColor=ececec" alt="Node.js 20 or later">
  <img src="https://img.shields.io/badge/Storybook-7%2B-FF4785?style=for-the-badge&logo=storybook&logoColor=000000&labelColor=ececec" alt="Storybook 7 or later">
  <a href="#license"><img src="https://img.shields.io/badge/License-UNLICENSED-666666?style=for-the-badge&labelColor=ececec" alt="License: UNLICENSED"></a>
</p>

<p align="center"><img src=".github/assets/icon.png" width="128" alt="Flowboard icon"></p>
<h1 align="center">Flowboard</h1>
<h3 align="center">Every screen of your app on one infinite canvas, straight from Storybook.</h3>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#canvas-controls">Controls</a> ·
  <a href="#build-from-source">Build</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="https://github.com/sponsors/IGOLz">Sponsor</a>
</p>

> [!NOTE]
> Bring your own Storybook project. Flowboard uses its existing stories and configuration; it does not generate screens.

## Why

Storybook shows one story at a time. Flowboard puts all your screens side by side so you can follow a flow, compare states and spot missing screens. Change your source code and the board rebuilds automatically.

## Install

Requires Node.js 20 or later and an existing Storybook 7+ setup, including React Native projects using `@storybook/react-native-web-vite`. Use a `node_modules` installation; Yarn Plug'n'Play is not supported.

Run this from the folder containing your `package.json` and `.storybook` config:

```sh
npx @igol/flowboard@latest init --open
```

`init` detects npm, pnpm, Yarn or Bun from `packageManager` or a lockfile, including at a parent workspace root. It installs Flowboard as a development dependency and adds `"flowboard": "flowboard --open"` to your scripts. It preserves existing scripts and refuses to overwrite a different `flowboard` script. Re-running it is safe. Custom `--config-dir`, `--port` and `--no-watch` options are saved in the script; config paths are relative to the project. With `--open` it also starts the dashboard. Without `--open` it only sets up the project.

Start it again with:

```sh
npm run flowboard    # or pnpm/yarn/bun run flowboard
```

For a manual installation:

```sh
npm install -D @igol/flowboard
npx flowboard --open
```

For a one-off run without adding a project dependency:

```sh
npx @igol/flowboard@latest --open    # dashboard on http://localhost:6007
```

| Option | Default | |
|---|---|---|
| `-p, --port <port>` | `6007` | Dashboard port |
| `-c, --config-dir <dir>` | `.storybook` | Storybook config folder |
| `--no-watch` | off | Build once, do not rebuild on changes |
| `-o, --open` | off | Open the dashboard in the browser |

Builds are cached in `node_modules/.cache/flowboard`, so the last build shows up at once while a fresh one runs.

<details>
<summary>Updates and versioning</summary>

Flowboard stays in `node_modules`; its dashboard source is never copied into your project. Commit your `package.json` and lockfile to share the same version with your team. Updates are explicit:

```sh
npm update @igol/flowboard                  # within the declared version range
npm install -D @igol/flowboard@latest       # latest release, including breaking changes
npx flowboard --version
```

For pnpm, Yarn and Bun, use their corresponding update commands. Stop and restart Flowboard after updating. A dependency installed from a local tarball must be replaced with a new tarball or a registry version first.

Releases use semantic versioning. During `0.x`, minor releases can include breaking changes; patches remain compatible. From `1.0`, breaking changes increment the major version. Flowboard never updates itself automatically.

</details>

## Features

Flowboard builds your stories and lays them out as live screens on a dotted canvas:

- one row per category (the story `title`, e.g. `Onboarding mobile`), with all its screens side by side;
- stories that are states of the same screen collapse into one screen with ‹ › arrows to switch state;
- categories and screens are named by position, e.g. `1 Accesso` and `1.1 Welcome`; clicking a name copies its id (`1.accesso`, `1.1.welcome`);
- every screen rendered at the size of the selected device (the Chrome DevTools device list);
- screens are real renders of your code: tap, type and scroll in them as in Storybook, then ↺ resets the screen to how it first loaded (its storage too);
- nothing in the board itself can be edited;
- no Storybook dev server: when a source file changes, Flowboard rebuilds and the canvas refreshes by itself.

<details>
<summary>Screen states and identifiers</summary>

Inside one category, stories collapse into a single screen when:

- they share a leading number: `02 · Home name` and `02 · Home name empty`;
- or one name is another plus a state word: `Dashboard` and `Dashboard Empty`, `Loading`, `Error`… (see `STATE_WORDS` in [dashboard/screens.js](dashboard/screens.js)).

`Create` and `Create Rooms` stay two screens: `Rooms` is not a state word.

Names and ids follow the story order: they change when stories are added or reordered. Storybook's own story id (e.g. `accesso--welcome`) stays stable.

</details>

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

## Privacy

Flowboard serves the dashboard and Storybook build locally at `localhost` and `127.0.0.1`. It rejects requests from other machines and adds no analytics or tracking. Storybook builds run with `--disable-telemetry`.

Board preferences stay in your browser's local storage. Build files stay in `node_modules/.cache/flowboard` inside your project. Installation and updates contact your configured package registry through your package manager.

Your stories run real application code. They can contact APIs and external services configured by your project. The board layout is read-only, but interacting with a story can change application data. Reset clears storage on the story origin, which is shared by the screens, and reloads the selected screen; it does not undo changes made to a backend.

## Build from source

Node.js 20 or later is enough. Flowboard has no package dependencies and no compilation step.

```sh
git clone https://github.com/IGOLz/flowboard.git
cd flowboard
npm test
node bin/flowboard.js --help
```

Run the CLI from a project with Storybook configured, rather than from the Flowboard checkout:

```sh
cd /path/to/your-storybook-project
node /path/to/flowboard/bin/flowboard.js --open
```

<details>
<summary>Test a local package</summary>

To test a local checkout before publishing a new release, create a package with `npm pack` in the Flowboard checkout, then run these commands in your target project:

```sh
npm install -D /absolute/path/to/igol-flowboard-0.1.0.tgz
npx flowboard init --open
```

The tarball is a real installation, independent of the source checkout. To test another local release, install its new tarball. You can also run directly from a checkout with `node /absolute/path/to/flowboard/bin/flowboard.js --open`.

</details>

<details>
<summary>How it works</summary>

- Screens are iframes of the static Storybook bundle, served from the other loopback name (`127.0.0.1` when the dashboard is on `localhost`). Being another site, they run in a separate browser process, so their JavaScript never stalls panning and zooming.
- [dashboard/frame.js](dashboard/frame.js) is injected into every screen. It reports when a story has rendered, so screens boot four at a time; hands ⌘/Ctrl+wheel zooms and middle/right drags begun over the screen to the canvas; and clears the screen's storage on reset.
- Each state of a screen is its own iframe, stacked in the same frame. A state is shown only once it has rendered, so switching never flashes blank, and switching back is instant. Reset loads a fresh iframe underneath the same way.
- The server only answers `localhost` / `127.0.0.1` requests from this machine.

</details>

<details>
<summary>Release a version</summary>

Run from a clean `main` checkout with an authenticated npm account authorized to publish `@igol/flowboard`. The package currently uses `UNLICENSED`, so distribution does not grant an open-source license.

1. Run `npm test` and `npm pack --dry-run`. Test the generated tarball in a separate Storybook project before publishing.
2. For subsequent releases, run `npm version patch`, `npm version minor` or `npm version major` and add release notes on GitHub. The initial version is `0.1.0`.
3. Run `npm publish --access public`. The `prepublishOnly` script runs the tests again. npm may require account authentication or 2FA.
4. After a successful publication, push the release commit and tags with `git push origin main --follow-tags`. Users can then install or update to the new version.

The npm package is `@igol/flowboard`; the executable command remains `flowboard`. Never include credentials or local build artifacts in a release.

</details>

## Contributing

Report bugs and suggest features through [GitHub issues](https://github.com/IGOLz/flowboard/issues). For bugs, include your Flowboard, Node.js and Storybook versions, your operating system, the command you ran and a minimal reproduction. Remove credentials and private project data from logs and examples.

For code changes, explain the problem and run `npm test` before opening a pull request. Check the license terms below before submitting code.

To support development, use [GitHub Sponsors](https://github.com/sponsors/IGOLz) or [PayPal](https://www.paypal.me/igol).

## Acknowledgements

[Storybook](https://storybook.js.org/) builds and renders the stories. Device presets come from [Chrome DevTools](https://developer.chrome.com/docs/devtools/device-mode/).

## License

The package is marked `UNLICENSED`. The source is publicly visible, but no open-source license or permission to reuse, modify or redistribute it is granted.
