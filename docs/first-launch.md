# First launch in Brave

This walkthrough uses the existing extension shell. You will open a toolbar popup and a full-tab dashboard. Profile editing, file access, and autofill are not implemented yet; the feature cards are a preview of future work.

## 1. Build the extension

Open a terminal in your checkout. If it is in your home directory:

```sh
cd ~/CVlization
node --version
npm --version
npm ci
npm run build
npm run check:dist
```

Use Node.js 24 LTS with its bundled npm. `npm ci` installs the exact dependencies from `package-lock.json`. Run it on the first checkout and after dependency changes; it is not needed for every source edit.

`npm run build` checks TypeScript and bundles the extension into `dist/`. `npm run check:dist` checks the manifest and packaged page assets. Its success message starts with `Extension package verified`. These commands do not test browser interactions.

The source checkout is like the source of a Java project; `dist/` is the built artifact that Brave loads. Do not edit generated files in `dist/`, because the next build replaces them.

## 2. Load it in Brave

1. Open `brave://extensions` in Brave's address bar.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the **dist** folder inside your checkout. Select the folder containing the generated `manifest.json`, not the repository root or `public/`.
4. On macOS, you can press **Command + Shift + G** in the folder picker and enter `~/CVlization/dist` if you used that checkout location.
5. Check that an enabled **CVlization** card appears.
6. Open the browser's extensions menu (the puzzle-piece button), find **CVlization**, and pin it to the toolbar.

No server, store account, or File System Access API flag is needed for this shell. The current manifest has no custom icon, so Brave supplies a generic one; identify it by the CVlization name.

## 3. Open the UI

Click the CVlization toolbar button. The popup should show **CVlization**, **A home for your job search.**, and **Open CVlization**.

Click **Open CVlization**. The popup closes and the dashboard opens in a browser tab. Expect the heading **Build your next chapter.**, the **Foundations** stage, and three planned-feature cards. Those cards do not open editors yet.

You can close the terminal after a normal build. Brave loads the files directly from `dist/`; there is no development server to keep running. Keep the folder in place while the extension is installed.

## 4. Rebuild and reload

For occasional changes, run:

```sh
npm run build
npm run check:dist
```

Then return to `brave://extensions` and click the reload arrow on the **CVlization** card. Close any old dashboard tab and open the popup and dashboard again. You do not need to use **Load unpacked** again for the same folder.

For repeated edits, run this instead:

```sh
npm run dev
```

This builds once and watches for changes. Wait for the build to finish before reloading the extension. It does not launch a server, run TypeScript checking, or automatically refresh Brave. Stop it with **Control + C**; the last successful build remains loadable. Run the normal build and package check before committing.

To practice seeing an edit, temporarily change `A home for your job search.` in the root `popup.html`, save, rebuild (or wait for the watcher), reload the extension, and reopen the popup. Restore the original text and repeat the same steps when finished.

## 5. Inspect problems

| Symptom | What to check |
| --- | --- |
| `node` or `npm` is not found | Open a new terminal after installing Node. If your zsh installation adds Node to `~/.zprofile`, run `source ~/.zprofile`, then retry the version commands. |
| `npm` cannot find `package.json` | Change into the CVlization checkout before running commands. |
| `dist/` does not exist or the manifest cannot be loaded | Finish `npm run build` successfully, then select `dist/`. |
| Popup is missing | Confirm CVlization is enabled in the same Brave profile, then open it from the extensions menu. |
| Changes do not appear | Check that the build succeeded and that you loaded this checkout's `dist/`; reload the extension and reopen its pages. |
| Popup button does not open the dashboard | Right-click inside the popup and choose **Inspect**. Look for errors in the **Console** tab. |
| Dashboard is blank or behaves unexpectedly | Right-click the dashboard, choose **Inspect**, and open **Console**. Also check the extension card for an **Errors** button. |

When reporting a problem, include the step that failed, the error text, and whether it came from the terminal or Brave. Do not paste personal data or credentials.

## Manual smoke checklist

Record these results in the launch issue or PR during review:

- [ ] The build and package check succeed.
- [ ] Brave loads the extension from `dist/` without an error.
- [ ] The toolbar button opens the popup.
- [ ] **Open CVlization** opens the dashboard with the expected headings.
- [ ] A temporary popup text edit appears after rebuilding and reloading, and is restored afterward.
- [ ] The popup and dashboard consoles contain no extension errors during this flow.

For background on Chromium's unpacked-extension workflow, see the official [Hello World extension tutorial](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).
