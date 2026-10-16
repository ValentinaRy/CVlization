import '../shared/styles.css';

const button = document.querySelector<HTMLButtonElement>('#open-dashboard');
const status = document.querySelector<HTMLParagraphElement>('#popup-status');

button?.addEventListener('click', async () => {
  try {
    await chrome.runtime.openOptionsPage();
    window.close();
  } catch {
    if (status) status.textContent = 'Could not open CVlization. Reload the extension and try again.';
  }
});
