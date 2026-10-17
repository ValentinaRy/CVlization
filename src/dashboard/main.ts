import '../shared/styles.css';
import './workspace';

const buildInfo = document.querySelector<HTMLParagraphElement>('#build-info');
if (buildInfo) {
  buildInfo.textContent = `CVlization · v${chrome.runtime.getManifest().version}`;
}

// Consume the success message once; refreshing or bookmarking the dashboard
// must not announce an old save. Render the filename as text, never markup.
const pageUrl = new URL(window.location.href);
const savedFilename = pageUrl.searchParams.get('saved');
if (savedFilename) {
  pageUrl.searchParams.delete('saved');
  window.history.replaceState(null, '', pageUrl);
  const notification = document.querySelector<HTMLElement>('#save-notification')!;
  notification.hidden = false;
  document.querySelector<HTMLElement>('#save-notification-text')!.textContent = `All saved: ${savedFilename}`;
  document.querySelector<HTMLButtonElement>('#dismiss-notification')!.addEventListener('click', () => { notification.hidden = true; });
  window.setTimeout(() => { notification.hidden = true; }, 8000);
}
