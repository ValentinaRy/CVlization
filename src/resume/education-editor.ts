import { dateRangeErrors } from './dates';
import { dateControl } from './date-control';
import { newEducationDraft, educationTextFields } from './education';
import type { EducationDraft } from './education';

export function educationEditor(container: HTMLElement, add: HTMLButtonElement, drafts: EducationDraft[], onChange: () => void) {
  const rows: { draft: EducationDraft; root: HTMLElement; legend: HTMLLegendElement; remove: HTMLButtonElement; from: ReturnType<typeof dateControl>; to: ReturnType<typeof dateControl> }[] = [];
  container.replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'note';
  empty.textContent = 'No education entries yet. Add one whenever you are ready.';
  container.append(empty);
  function refresh() {
    empty.hidden = drafts.length > 0;
    rows.forEach((row, index) => {
      row.legend.textContent = `Education ${index + 1}`;
      row.remove.setAttribute('aria-label', `Remove education entry ${index + 1}`);
      row.to.setDisabled(row.draft.current);
      const errors = dateRangeErrors(row.draft);
      row.from.setError(errors.startDate);
      row.to.setError(errors.endDate);
    });
  }
  function changed() { refresh(); onChange(); }
  function append(draft: EducationDraft) {
    // DOM identifiers are independent of user-controlled IDs read from disk.
    const prefix = `education-${crypto.randomUUID()}`;
    const root = document.createElement('fieldset');
    root.className = 'dated-entry';
    const legend = document.createElement('legend');
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    const labels = { institution: 'Institution', area: 'Field of study', studyType: 'Degree / qualification', location: 'Location', url: 'Institution website', score: 'Grade / score' };
    function textField(key: typeof educationTextFields[number] | 'coursesText', labelText: string, multiline = false) {
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
    for (const key of educationTextFields) textField(key, labels[key]);
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
    currentLabel.append(current, document.createTextNode('Currently studying'));
    grid.append(currentLabel);
    textField('coursesText', 'Courses (bullet points)', true);
    const help = document.createElement('p');
    help.className = 'note full-width';
    help.textContent = 'One course per line. Optional leading markers: - * + > < # •.';
    grid.append(help);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = 'Remove education entry';
    remove.addEventListener('click', () => {
      const hasContent = draft.current || [...educationTextFields, 'startDate', 'endDate', 'coursesText'].some(key => String(draft[key as keyof EducationDraft]).trim()) || Object.keys(draft.source).some(key => !['id', 'current'].includes(key));
      if (hasContent && !window.confirm('Remove this education entry from the draft? The file changes only when you save.')) return;
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
    const draft = newEducationDraft();
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
