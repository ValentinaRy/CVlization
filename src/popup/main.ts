import '../shared/styles.css';
import { captureName } from '../debug/model';

const button = document.querySelector<HTMLButtonElement>('#open-dashboard');
const status = document.querySelector<HTMLParagraphElement>('#popup-status');

button?.addEventListener('click', async () => {
  try {
    await chrome.runtime.openOptionsPage();
    window.close();
  } catch {
    if (status) {
      status.dataset.state = 'error';
      status.textContent = 'Could not open CVlization. Reload the extension and try again.';
    }
  }
});

const debugForm = document.querySelector<HTMLFormElement>('#debug-capture-form')!;
const debugName = document.querySelector<HTMLInputElement>('#debug-capture-name')!;
document.querySelector('#debug-toggle')!.addEventListener('click', () => { debugForm.hidden = false; debugName.focus(); });
document.querySelector('#debug-cancel')!.addEventListener('click', () => { debugForm.hidden = true; });
document.querySelector('#debug-library')!.addEventListener('click', async () => {
  try { await chrome.tabs.create({ url: chrome.runtime.getURL('debug.html') }); window.close(); }
  catch { if (status) { status.dataset.state = 'error'; status.textContent = 'Could not open debug captures. Reload the extension and try again.'; } }
});
debugForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const name = captureName(debugName.value);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url ?? '')) throw new Error('Open an HTTP or HTTPS application page before capturing.');
    const url = new URL(chrome.runtime.getURL('debug.html'));
    url.searchParams.set('tab', String(tab.id)); url.searchParams.set('name', name);
    url.searchParams.set('values', String(document.querySelector<HTMLInputElement>('#debug-values')!.checked));
    await chrome.tabs.create({ url: url.href });
    window.close();
  } catch (error) { if (status) { status.dataset.state = 'error'; status.textContent = error instanceof Error ? error.message : 'Could not capture this page.'; } }
});
