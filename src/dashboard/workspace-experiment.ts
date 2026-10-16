export {};

// This experiment deliberately keeps handles in memory; reconnecting belongs to the next task.
const pickerWindow = window as Window & {
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
};

const testUser = {
  firstName: 'Alex',
  lastName: 'Taylor',
  email: 'alex.taylor@example.com',
  dateOfBirth: '1995-06-15',
};
const sourceJson = JSON.stringify(testUser, null, 2);
const chooseButton = document.querySelector<HTMLButtonElement>('#choose-test-folder')!;
const writeButton = document.querySelector<HTMLButtonElement>('#write-test-file')!;
const readButton = document.querySelector<HTMLButtonElement>('#read-test-file')!;
const source = document.querySelector<HTMLElement>('#test-source')!;
const result = document.querySelector<HTMLElement>('#test-result')!;
const fileLocation = document.querySelector<HTMLParagraphElement>('#test-location')!;
const experimentStatus = document.querySelector<HTMLParagraphElement>('#test-status')!;

let folder: FileSystemDirectoryHandle | undefined;
let writtenFile: FileSystemFileHandle | undefined;
let busy = false;

source.textContent = sourceJson;

function showStatus(message: string, error = false) {
  experimentStatus.textContent = message;
  experimentStatus.dataset.state = error ? 'error' : 'info';
}

function updateButtons() {
  chooseButton.disabled = busy || !pickerWindow.showDirectoryPicker;
  writeButton.disabled = busy || !folder;
  readButton.disabled = busy || !writtenFile;
}

function reportError(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message : 'Please try again.';
  showStatus(`${action} failed. ${detail}`, true);
}

if (!pickerWindow.showDirectoryPicker) {
  showStatus('Folder access is unavailable. In Brave, enable File System Access API at brave://flags/#file-system-access-api, restart the browser, and reopen this page.', true);
}
updateButtons();

chooseButton.addEventListener('click', async () => {
  if (!pickerWindow.showDirectoryPicker) return;
  busy = true;
  updateButtons();
  try {
    // Open the picker directly from the click so the browser sees a user gesture.
    const selected = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
    folder = selected;
    writtenFile = undefined;
    fileLocation.textContent = `Folder: ${folder.name}`;
    result.textContent = 'No file read yet.';
    showStatus('Folder selected. Write the fictional user to a new test file.');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      showStatus('Folder selection cancelled. The previous selection, if any, is unchanged.');
    } else {
      reportError('Folder selection', error);
    }
  } finally {
    busy = false;
    updateButtons();
  }
});

writeButton.addEventListener('click', async () => {
  if (!folder) return;
  busy = true;
  writtenFile = undefined;
  result.textContent = 'No file read yet.';
  fileLocation.textContent = `Folder: ${folder.name}`;
  updateButtons();
  showStatus('Writing test file…');
  try {
    const name = `cvlization-test-user-${crypto.randomUUID()}.json`;
    // Refuse an existing name, even in the unlikely event of a generated-name collision.
    let exists = false;
    try {
      await folder.getFileHandle(name);
      exists = true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
    if (exists) throw new Error('The test filename already exists. Try again to use a new name.');

    const file = await folder.getFileHandle(name, { create: true });
    const writer = await file.createWritable();
    try {
      await writer.write(`${sourceJson}\n`);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => { /* The stream may already be closed. */ });
      throw error;
    }
    writtenFile = file;
    fileLocation.textContent = `Folder: ${folder.name} · File: ${file.name}`;
    showStatus('Test file saved. Read it back and compare the two panels.');
  } catch (error) {
    reportError('Writing', error);
  } finally {
    busy = false;
    updateButtons();
  }
});

readButton.addEventListener('click', async () => {
  if (!writtenFile) return;
  busy = true;
  result.textContent = 'Reading file…';
  updateButtons();
  showStatus('Reading test file…');
  try {
    // Get a fresh File each time: the result comes from disk, not from the source fixture.
    const file = await writtenFile.getFile();
    const data: unknown = JSON.parse(await file.text());
    result.textContent = JSON.stringify(data, null, 2);
    showStatus('File read. Compare all four values with the source on the left.');
  } catch (error) {
    result.textContent = 'Could not read JSON from the file.';
    reportError('Reading', error);
  } finally {
    busy = false;
    updateButtons();
  }
});
