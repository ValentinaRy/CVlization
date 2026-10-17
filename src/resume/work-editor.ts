import { dateRangeErrors } from './dates';
import { dateControl } from './date-control';
import { newWorkDraft, workTextFields } from './work';
import type { WorkDraft } from './work';

export function workEditor(container: HTMLElement, add: HTMLButtonElement, drafts: WorkDraft[], onChange: () => void) {
  const rows: { draft: WorkDraft; root: HTMLElement; legend: HTMLLegendElement; remove: HTMLButtonElement; from: ReturnType<typeof dateControl>; to: ReturnType<typeof dateControl> }[] = [];
  container.replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'note';
  empty.textContent = 'No positions yet. Add one whenever you are ready.';
  container.append(empty);
  function refresh() {
    empty.hidden = drafts.length > 0;
    rows.forEach((row, index) => {
      row.legend.textContent = `Position ${index + 1}`;
      row.remove.setAttribute('aria-label', `Remove position ${index + 1}`);
      row.to.setDisabled(row.draft.current);
      const errors = dateRangeErrors(row.draft);
      row.from.setError(errors.startDate);
      row.to.setError(errors.endDate);
    });
  }
  function changed() { refresh(); onChange(); }
  function append(draft: WorkDraft) {
    // DOM identifiers are independent of user-controlled IDs read from disk.
    const prefix = `work-${crypto.randomUUID()}`;
    const root = document.createElement('fieldset');
    root.className = 'dated-entry';
    const legend = document.createElement('legend');
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    const labels = { name: 'Company', position: 'Position', location: 'Location', description: 'Company description', url: 'Company website', summary: 'Summary' };
    function textField(key: typeof workTextFields[number] | 'highlightsText', labelText: string, multiline = false) {
      const wrapper = document.createElement('div');
      if (multiline) wrapper.className = 'full-width';
      const label = document.createElement('label');
      const input = multiline ? document.createElement('textarea') : document.createElement('input');
      label.htmlFor = input.id = `${prefix}-${key}`;
      label.textContent = labelText;
      input.value = draft[key];
      if (input instanceof HTMLTextAreaElement) input.rows = 5;
      if (input instanceof HTMLInputElement) input.type = key === 'url' ? 'url' : 'text';
      input.addEventListener('input', () => { draft[key] = input.value; changed(); });
      wrapper.append(label, input);
      grid.append(wrapper);
    }
    for (const key of workTextFields.filter(key => key !== 'summary')) textField(key, labels[key]);
    const from = dateControl(`${prefix}-from`, 'From', draft.startDate, value => { draft.startDate = value; changed(); });
    const to = dateControl(`${prefix}-to`, 'To', draft.endDate, value => { draft.endDate = value; changed(); });
    const dates = document.createElement('div');
    dates.className = 'form-grid full-width entry-dates';
    dates.append(from.root, to.root);
    grid.append(dates);
    const currentLabel = document.createElement('label');
    currentLabel.className = 'checkbox-label full-width';
    const current = document.createElement('input');
    current.type = 'checkbox';
    current.checked = draft.current;
    current.addEventListener('change', () => { draft.current = current.checked; changed(); });
    currentLabel.append(current, document.createTextNode('Current position'));
    grid.append(currentLabel);
    textField('summary', labels.summary, true);
    textField('highlightsText', 'Highlights (bullet points)', true);
    const help = document.createElement('p');
    help.className = 'note full-width';
    help.textContent = 'One highlight per line. Optional leading markers: - * + > < # •. Summary is saved as written.';
    grid.append(help);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = 'Remove position';
    remove.addEventListener('click', () => {
      const hasContent = draft.current || [...workTextFields, 'startDate', 'endDate', 'highlightsText'].some(key => String(draft[key as keyof WorkDraft]).trim()) || Object.keys(draft.source).some(key => !['id', 'current'].includes(key));
      if (hasContent && !window.confirm('Remove this position from the draft? The file changes only when you save.')) return;
      drafts.splice(drafts.indexOf(draft), 1);
      rows.splice(rows.findIndex(row => row.draft === draft), 1);
      root.remove();
      changed();
      add.focus();
    });
    root.append(legend, grid, remove);
    container.append(root);
    rows.push({ draft, root, legend, remove, from, to });
    return root;
  }
  for (const draft of drafts) append(draft);
  add.onclick = () => {
    const draft = newWorkDraft();
    drafts.push(draft);
    const root = append(draft);
    changed();
    root.querySelector<HTMLInputElement>('input')?.focus();
  };
  refresh();
  return {
    focusFirstError() {
      refresh();
      const invalid = container.querySelector<HTMLInputElement>('[aria-invalid="true"]');
      invalid?.focus();
      return !!invalid;
    },
  };
}
