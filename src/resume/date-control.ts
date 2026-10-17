import { formatDateForInput, parseDateInput } from './dates';

/** Editable display text with one native full-date calendar opened on demand. */
export function dateControl(id: string, labelText: string, value: string, onInput: (value: string) => void) {
  const root = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.value = value;
  input.placeholder = 'e.g. 15/05/2026';
  input.autocomplete = 'off';
  input.setAttribute('aria-describedby', `${id}-hint ${id}-error`);
  input.setAttribute('aria-keyshortcuts', 'Alt+ArrowDown');
  const controls = document.createElement('div');
  controls.className = 'date-input';
  const icon = document.createElement('span');
  icon.className = 'date-icon';
  icon.textContent = '▦';
  icon.setAttribute('aria-hidden', 'true');
  const hint = document.createElement('p');
  hint.id = `${id}-hint`;
  hint.className = 'note';
  hint.textContent = 'DD/MM/YYYY. Click for a calendar, or type a date. MM/YYYY uses day 01. Alt+↓ also opens the calendar.';
  const error = document.createElement('p');
  error.id = `${id}-error`;
  error.className = 'note';
  error.setAttribute('aria-live', 'polite');
  const picker = document.createElement('input');
  picker.type = 'date';
  picker.className = 'native-picker';
  picker.tabIndex = -1;
  picker.setAttribute('aria-hidden', 'true');
  const openPicker = () => {
    if (input.disabled) return;
    try {
      let normalized: string | undefined;
      try { normalized = parseDateInput(input.value); } catch { /* Partial input does not block the calendar. */ }
      picker.value = normalized ?? '';
      picker.showPicker();
    } catch {
      hint.textContent = 'The calendar is unavailable here. Type DD/MM/YYYY or MM/YYYY instead.';
      input.focus();
    }
  };
  input.addEventListener('click', openPicker);
  input.addEventListener('keydown', event => {
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      openPicker();
    }
  });
  picker.addEventListener('change', () => {
    // Cancelling a picker does not clear typed text. Clearing uses the text field.
    if (!picker.value) return;
    input.value = formatDateForInput(picker.value);
    onInput(input.value);
    input.focus();
  });
  input.addEventListener('input', () => onInput(input.value));
  controls.append(input, icon, picker);
  root.append(label, controls, hint, error);
  return {
    root, input,
    setDisabled(disabled: boolean) {
      input.disabled = disabled;
      picker.disabled = disabled;
    },
    setError(message?: string) {
      input.setAttribute('aria-invalid', String(!!message));
      error.textContent = message ?? '';
      error.dataset.state = message ? 'error' : 'info';
    },
  };
}
