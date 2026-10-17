import '../shared/styles.css';
import './workspace';

const buildInfo = document.querySelector<HTMLParagraphElement>('#build-info');
if (buildInfo) {
  buildInfo.textContent = `CVlization · v${chrome.runtime.getManifest().version}`;
}
