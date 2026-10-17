# Current extension architecture

## Current scaffold

CVlization is a Manifest V3 extension built with TypeScript and Vite. It currently contains a toolbar popup and a dashboard that opens in a browser tab. Its manifest requests no extension permissions. It has no network calls, background worker, or website scripts. A small dashboard experiment uses the browser folder picker to write and read a fictional JSON record; production profile persistence is not implemented yet.

Vite compiles two HTML entry points into `dist/` and copies `public/manifest.json` unchanged. Type checking runs separately before production builds. Development uses a build watcher rather than a web server so the output can be loaded as an unpacked extension.

## Entry points

- `popup.html` and `src/popup/main.ts` implement the toolbar popup. Its button opens the extension's options page in a browser tab.
- `dashboard.html` and `src/dashboard/main.ts` implement that full-tab page. It displays the current development stage and reads the installed version from the manifest.
- `src/dashboard/workspace-experiment.ts` implements the manual file experiment. It renders workspace connection states and the file experiment. The latest test file handle stays in memory for the current page. Each write uses a new test filename and each read fetches the file again from disk.
- `src/workspace/access.ts` checks read/write permission and folder availability without writing probe files. Permission requests happen only on a Reconnect click; restore and focus checks never prompt.
- `src/workspace/handle-store.ts` stores only the selected directory handle in IndexedDB. File contents remain in the selected folder. If browser storage cannot restore the handle, the user can select the folder again.
- `src/shared/styles.css` supplies the styling for both pages.
- `public/manifest.json` declares the popup and the full-tab options page. No permissions are requested by the current scaffold.

## Build validation

`npm run build` checks TypeScript and creates the extension package. `npm run check:dist` verifies Manifest V3, matching package and manifest versions, and the presence of local page assets. GitHub Actions runs both commands after installing locked dependencies.

This document describes the current implementation. Future feature scope lives in GitHub Issues and the README roadmap; working design notes are maintained locally.
