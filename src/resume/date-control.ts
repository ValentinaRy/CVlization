import { normalizeDate } from './dates';

/** Free text preserves incomplete keyboard input; native pickers supply valid dates. */
export function dateControl(id: string, labelText: string, value: string, onInput: (value: string) => void) {
  const root = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.value = value;
  input.placeholder = 'e.g. 2026-05-15 or 2026-05';
  input.autocomplete = 'off';
  input.setAttribute('aria-describedby', `${id}-hint ${id}-error`);
  const controls = document.createElement('div');
  controls.className = 'date-controls';
  const hint = document.createElement('p');
  hint.id = `${id}-hint`;
  hint.className = 'note';
  hint.textContent = 'Type a date or choose one. A month without a day is saved with day 01.';
  const error = document.createElement('p');
  error.id = `${id}-error`;
  error.className = 'note';
  error.setAttribute('aria-live', 'polite');
  const pickers: HTMLInputElement[] = [];
  const buttons: HTMLButtonElement[] = [];
  for (const type of ['date', 'month'] as const) {
    const picker = document.createElement('input');
    picker.type = type;
    picker.className = 'native-picker';
    picker.tabIndex = -1;
    picker.setAttribute('aria-label', `Choose ${labelText.toLowerCase()} ${type}`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = type === 'date' ? '▦ Date' : '▦ Month';
    button.setAttribute('aria-label', `Choose ${labelText.toLowerCase()} ${type}`);
    button.addEventListener('click', () => {
      try {
        let normalized: string | undefined;
        try { normalized = normalizeDate(input.value); } catch { /* An incomplete input does not block the picker. */ }
        picker.value = normalized ? type === 'date' ? normalized : normalized.slice(0, 7) : '';
        picker.showPicker();
      } catch {
        hint.textContent = 'The picker is unavailable here. Type YYYY-MM-DD or YYYY-MM instead.';
        input.focus();
      }
    });
    picker.addEventListener('change', () => {
      // Cancelling a picker does not clear typed text. Clearing uses the text field.
      if (!picker.value) return;
      input.value = picker.value;
      onInput(input.value);
      input.focus();
    });
    controls.append(button, picker);
    pickers.push(picker);
    buttons.push(button);
  }
  input.addEventListener('input', () => onInput(input.value));
  root.append(label, input, controls, hint, error);
  return {
    root, input,
    setDisabled(disabled: boolean) {
      input.disabled = disabled;
      for (const element of [...pickers, ...buttons]) element.disabled = disabled;
    },
    setError(message?: string) {
      input.setAttribute('aria-invalid', String(!!message));
      error.textContent = message ?? '';
      error.dataset.state = message ? 'error' : 'info';
    },
  };
}
