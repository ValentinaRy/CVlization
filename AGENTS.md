# Working on CVlization

- Keep source code, comments, documentation, commit messages, and UI text in English. Future localized field labels are an intentional exception.
- Keep private progress notes, decisions, and open questions in `.ai/`. Never force-add that directory to Git.
- Read `.ai/` notes if available, but keep public documentation sufficient for contributors without them.
- Keep real resumes, photos, diplomas, application data, credentials, and API keys outside the repository. Use fictional fixtures.
- Target desktop Chromium browsers, with Brave as the primary manual test browser.
- Use TypeScript and Manifest V3. Add permissions only when an implemented feature needs them.
- Preserve the local-first design: the selected workspace is the planned source of truth; browser indexes must be rebuildable.
- Do not add Gmail API integration. The planned email feature reads an open page on explicit user action.
- Distinguish implemented functionality from future plans. Move the single roadmap flag in README when work moves to the next stage.
- Run `npm run build` and `npm run check:dist` after changes to the extension or build setup. Add meaningful tests when behavior warrants them.
