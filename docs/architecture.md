# Current extension architecture

CVlization is a Manifest V3 extension built with TypeScript and Vite. It has a toolbar popup, a full-tab dashboard, and a separate resume editor. The manifest requests no extension permissions. There are no network calls, background workers, or website scripts.

## Entry points

- `popup.html` / `src/popup/main.ts`: open the dashboard through the extension options page.
- `dashboard.html` / `src/dashboard/main.ts`: display the development stage and workspace UI. `src/dashboard/workspace.ts` restores folder access and lists JSON files without reading their contents.
- `resume.html` / `src/resume/main.ts`: edit optional basic details, country name, address, repeatable social profiles, work experience, and education. Derived name/phone values are generated on save and have no controls. A required filename is independent of the professional title. Opening an existing file validates it before enabling editing.
- `src/shared/styles.css`: shared cotton-candy styling, including form controls.

Vite bundles all three HTML entry points into `dist/` and copies the manifest. Development uses a build watcher rather than a web server; the browser extension is reloaded manually.

## Data and persistence

- `src/workspace/access.ts` checks read/write permission and folder availability. Permission requests happen on an explicit Reconnect action.
- `src/workspace/handle-store.ts` stores only the selected directory handle in IndexedDB. Resume contents remain in the chosen folder.
- `src/resume/model.ts` validates the supported local structure, derives combined names and phone numbers, and preserves unedited fields. Current files use root `schemaVersion` and `id`, with JSON Resume-style `basics` nesting and additional name/phone components beside standard fields. External file import is not implemented.
- `src/resume/work.ts` validates work-entry structure and transforms drafts while preserving IDs and unknown fields. It stores explicit current flags, omits endDate for current positions, and parses edited highlights lines without transforming summary text. Saved highlights are displayed with a leading `- ` per item; unchanged arrays retain their original contents.
- `src/resume/education.ts` validates education entries and preserves stable IDs, unknown fields, and other sections. Score is text, location is free text, and courses is an array. Ongoing study uses the same explicit current flag and end-date omission as Work.
- `src/resume/bullet-list.ts` provides the shared line parsing and display formatting for highlights and courses.
- `src/resume/dates.ts` checks real calendar dates, converts DD/MM/YYYY display values to and from YYYY-MM-DD storage, defaults month-only input to day 01, and avoids timezone conversion. The shared range validation requires endDate > startDate only when both dates are supplied and current is false; future dates and multiple current entries are allowed in both Work and Education.
- `src/resume/work-editor.ts` and `education-editor.ts` keep both sections visible even when empty and reuse `date-control.ts`. Dates accept keyboard input and open one native full-date calendar on a field click or Alt+Down; To is disabled while Current position or Currently studying is checked. Existing entries without current are not assumed to be current merely because endDate is absent.
- `src/resume/filenames.ts` trims filename stems, permits ordinary punctuation, rejects forbidden characters/reserved names, and checks collisions, including case and Unicode normalization aliases.
- `src/resume/repository.ts` reads fresh file contents and writes only on explicit Save. It checks the loaded file snapshot before updating, aborts unsuccessful writes, and commits through the writable stream's close operation. It attempts to remove an empty newly created file after a failed first write; cleanup can fail if permission is lost.
- `src/resume/session.ts` tracks the draft and last successful save. The initial comparison snapshot is taken after display formatting, so opening a file does not itself mark it unsaved. A failed save retains the draft; a different filename creates a copy with a new resume identity.

Editor writes are serialized between extension pages with Web Locks. Snapshot checks prevent overwriting already-detected external edits; this is not a filesystem transaction coordinated with other applications. Basic navigation warnings are present, but there is no persistent draft recovery. The editor keeps the workspace handle it opened with and displays its name.

All resume content is optional. Format warnings for email, URLs, and phone codes do not prevent saving a draft. Structural errors, unsafe filenames, collisions, invalid entered dates, and reversed/equal work or education dates do prevent writes. Missing work and education dates are allowed. Successful Save returns to the dashboard and displays a one-time, dismissible notification naming the file. Placeholder examples are never form values. Country-name entry is free text for now; country-code derivation and image/document controls are deferred. Existing image values and untouched country codes are preserved; changing the country name clears a potentially stale code. User text is inserted as text or input values.

## Validation

`npm test` runs Vitest tests for data transformations, validation, naming, and save/failure decisions using fictional fixtures and a filesystem test double. `npm run build` checks TypeScript and bundles the extension. `npm run check:dist` checks Manifest V3, matching versions, and local assets for all three pages. GitHub Actions runs these checks after installing locked dependencies.

Real file permissions, native prompts, and UI acceptance are tested manually by the owner in Brave. This document describes implemented behavior; future feature scope is tracked in GitHub Issues and the README roadmap.
