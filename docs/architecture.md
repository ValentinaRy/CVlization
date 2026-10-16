# Current extension architecture

## Current scaffold

CVlization is a Manifest V3 extension built with TypeScript and Vite. It currently contains a toolbar popup and a dashboard that opens in a browser tab. It requests no permissions and has no network calls, background worker, website scripts, or persistence yet.

Vite compiles two HTML entry points into `dist/` and copies `public/manifest.json` unchanged. Type checking runs separately before production builds. Development uses a build watcher rather than a web server so the output can be loaded as an unpacked extension.

## Entry points

- `popup.html` and `src/popup/main.ts` implement the toolbar popup. Its button opens the extension's options page in a browser tab.
- `dashboard.html` and `src/dashboard/main.ts` implement that full-tab page. It displays the current development stage and reads the installed version from the manifest.
- `src/shared/styles.css` supplies the styling for both pages.
- `public/manifest.json` declares the popup and the full-tab options page. No permissions are requested by the current scaffold.

## Build validation

`npm run build` checks TypeScript and creates the extension package. `npm run check:dist` verifies Manifest V3, matching package and manifest versions, and the presence of local page assets. GitHub Actions runs both commands after installing locked dependencies.

This document describes the current implementation. Future feature scope lives in GitHub Issues and the README roadmap; working design notes are maintained locally.
