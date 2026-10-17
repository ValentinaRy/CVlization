import { withTag } from './tags';

export type TagDraft = { values: string[]; input: string };

export function tagControl(id: string, labelText: string, draft: TagDraft, onChange: () => void) {
  const root = document.createElement('div');
  root.className = 'full-width';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const list = document.createElement('ul');
  list.className = 'tag-list';
  list.setAttribute('aria-label', labelText);
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.autocomplete = 'off';
  input.value = draft.input;
  input.placeholder = 'Type a word or phrase, then press Enter';
  const hint = document.createElement('p');
  hint.id = `${id}-hint`;
  hint.className = 'note';
  hint.textContent = 'Enter adds one tag. Text still in this field is also included when you save.';
  input.setAttribute('aria-describedby', hint.id);
  const status = document.createElement('p');
  status.className = 'note';
  status.setAttribute('role', 'status');
  function renderTags() {
    list.replaceChildren();
    draft.values.forEach((value, index) => {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tag-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${labelText.toLowerCase()} tag: ${value}`);
      remove.addEventListener('click', () => {
        draft.values.splice(index, 1);
        renderTags();
        onChange();
        status.textContent = `Removed ${value}.`;
        const buttons = list.querySelectorAll<HTMLButtonElement>('button');
        (buttons[Math.min(index, buttons.length - 1)] ?? input).focus();
      });
      item.append(text, remove);
      list.append(item);
    });
  }
  input.addEventListener('input', () => { draft.input = input.value; status.textContent = ''; onChange(); });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    const value = draft.input.trim();
    const updated = withTag(draft.values, draft.input);
    const added = updated.length > draft.values.length;
    draft.values = updated;
    draft.input = input.value = '';
    renderTags();
    onChange();
    status.textContent = value ? added ? `Added ${value}.` : `${value} is already added.` : '';
  });
  renderTags();
  root.append(label, list, input, hint, status);
  return root;
}
