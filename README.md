# CVlization

**Less stress. More possibility.**

CVlization (*CV + civilization*) is a local-first browser companion for job applications. The goal is simple: enter your career history once, reuse it across awkward application forms, and keep your documents and application history in a folder you control.

Built as a learning project with TypeScript and browser extensions, with public development on GitHub. Desktop Chromium browsers are the target, with Brave as the primary test browser.

> 🚩 **Current stage: 02 — Local workspace.** A first JSON write/read experiment is available. Profile storage, autofill, tracking, and document generation are not implemented yet.

## The idea

- Fill separate company, role, and date fields, or assemble the same experience into one text field.
- Keep a structured profile, resume PDFs, a photo, and supporting documents locally.
- Save each application with the vacancy text, status history, and the exact documents submitted.
- Reuse multiple cover-letter templates, substitute vacancy details, and generate plain text or a PDF.
- Compare an open vacancy with your profile and explain matches and missing information.
- Read an open email on request, suggest the matching application and status, and let you confirm the update.

The core workflow is intended to run without an account or our own backend. Optional external AI features may come later and would explicitly send selected data to the chosen provider.

## What works today

- A Manifest V3 extension shell with a toolbar popup and a full-tab dashboard.
- A workspace connection panel that remembers the selected folder in this browser, checks access on reopening, and offers Reconnect when permission is needed.
- A dashboard experiment that writes a fictional user to a new JSON file in a selected folder and reads it back for visual comparison.
- TypeScript checking and a Vite build for local installation.
- A build watcher for development and a package sanity check.
- A GitHub Actions workflow that checks and builds the project.

The manifest requests no extension permissions. Workspace access is granted through the browser picker. The extension remembers a directory handle in local browser storage, checks folder availability, and reads the test files it creates. Profile data is not stored in the browser. It makes no network requests and reads no websites. The feature cards describe future work.

## Run locally

Install **Node.js 24 LTS**, including npm, and Git. If you use nvm, run `nvm install` and `nvm use` in the project directory.

```sh
npm ci
npm run build
npm run check:dist
```

Then load the extension:

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project's `dist/` directory.
4. Pin CVlization, click its icon, and choose **Open CVlization**.

No web server or store publication is needed for local use.

### Development loop

```sh
npm run dev
```

This watches source files and rebuilds `dist/`; it does not start a website or automatically reload the extension. Reload the extension on the extensions page and reopen its UI after changes. When content scripts are added, reload the target website too. Run `npm run typecheck` separately while developing; `npm run build` includes that check.

Use DevTools to inspect the dashboard, or right-click the popup and choose **Inspect**. Build output belongs in `dist/` and is not committed.

### Brave and workspace access

The file experiment may require enabling **File System Access API** at `brave://flags/#file-system-access-api`, followed by a browser restart. In the dashboard, choose a dedicated test folder, write the fictional user, and read the file back. Each write creates a new `cvlization-test-user-<id>.json` file. The folder handle is remembered in this browser. After reopening or restarting, check the folder name and connection state; use **Reconnect** to grant access again, or **Choose folder** if the folder cannot be restored. Clearing extension storage may require selecting it again. The experiment's last test file is remembered only in the current tab, so write a new test file before reading after reopening.

## Roadmap

**Legend:** 🚩 current stage · ⬜ upcoming · ✅ completed.

Keep exactly one flag in the table. When work starts on the next stage, mark the previous stage complete and move the flag. These are milestones, not release-date promises.

| Stage | Status | Outcome |
| --- | --- | --- |
| 01 · Foundations | ✅ Completed | Project structure, installable shell, build workflow, and first manual Brave smoke check. |
| 02 · Local workspace | 🚩 Current | Choose a folder; read/write versioned JSON; reconnect after restart; register documents with relative paths. |
| 03 · Profile and autofill | ⬜ Upcoming | Edit career history; fill supported forms by click; handle repeated experience blocks and dates on one platform; offer manual field mapping. |
| 04 · Application archive | ⬜ Upcoming | Save vacancies and submission snapshots; track dates, notes, and statuses; browse a fast overview backed by a rebuildable index. |
| 05 · Cover letters | ⬜ Upcoming | Multiple named/language-specific templates; optional copy-and-paste AI prompt workflow; variable substitution, editing, local PDF generation, and supported file uploads. |
| 06 · Vacancy assessment | ⬜ Upcoming | Explain skill and requirement matches for an open vacancy, including a LinkedIn-focused assessment workflow where permitted. |
| 07 · Email-assisted tracking | ⬜ Upcoming | Read the open message on request; suggest the application and status; update only after confirmation. No Gmail API integration. |
| 08 · Optional AI | ⬜ Upcoming | Explicit, opt-in LLM analysis and tailored drafts using selected profile and vacancy data. |
| 09 · Public release | ⬜ Upcoming | Compatibility checks, accessibility, icons, data-handling documentation, packaging, and store submission. |

### Later exploration

- Additional application platforms and languages.
- User-selected application queues and carefully reviewed automation on supported sites.
- Optional encryption and backup workflows.

Broad crawling and automatic submission are not initial requirements. Platform rules, form reliability, and user control determine what can be supported.

## Project layout

```text
CVlization/
├── .github/workflows/     # Continuous integration
├── .ai/                  # Private local notes; ignored by Git
├── docs/                 # Documentation of the current implementation
├── public/manifest.json  # Extension metadata, copied into dist/
├── scripts/              # Build/package checks
├── src/
│   ├── dashboard/        # Full-tab application UI
│   ├── popup/            # Toolbar popup
│   └── shared/           # Shared styling and future common modules
├── dashboard.html
├── popup.html
├── package.json
├── package-lock.json
├── tsconfig.json
└── vite.config.ts
```

See the [current extension architecture](docs/architecture.md). Working design notes remain local; feature scope and acceptance criteria are tracked in GitHub Issues.

## Data and contribution conventions

- Keep the personal workspace **outside this repository**. Never commit real resumes, photos, diplomas, messages, API keys, or application records.
- Use fictional data in examples and future tests.
- Write code, comments, UI text, documentation, and commit messages in English. Future localized field recognition is an intentional exception.
- Keep private progress and open questions in `.ai/`; it is excluded from Git.
- Distinguish implemented features from roadmap items.

Before submitting a change:

```sh
npm run build
npm run check:dist
```

For UI and extension behavior, also perform the relevant manual check in Brave. The initial automated check validates packaging, not real-world form compatibility.

## Distribution

GitHub hosts the source. A future GitHub release can include a ZIP of the contents of `dist/` for manual installation. Chrome Web Store publication, which also serves Brave users, is a separate future step. The extension is not currently published in a store.

## License

A license has not been selected yet. Public visibility alone does not grant an open-source license; explicit reuse terms will be added before presenting this project as licensed open-source software.
