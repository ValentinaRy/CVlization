import { dateControl } from './date-control';
import { tagControl } from './tag-control';
import { addOptionalSection, availableSections, optionalDateErrors, optionalEntryHasContent, optionalEntryToDraft, optionalSectionKeys, optionalSections, removeOptionalSection } from './optional-sections';
import type { OptionalEntryDraft, OptionalSectionKey, OptionalSectionsDraft } from './optional-sections';

export function optionalSectionsEditor(container: HTMLElement, controls: HTMLElement, addSection: HTMLButtonElement, menu: HTMLElement, drafts: OptionalSectionsDraft, onChange: () => void) {
  const rendered = new Map<OptionalSectionKey, { root: HTMLElement; refresh: () => void }>();
  container.replaceChildren();
  function closeMenu(focus = false) {
    menu.hidden = true;
    addSection.setAttribute('aria-expanded', 'false');
    if (focus) addSection.focus();
  }
  function refreshMenu() {
    const available = availableSections(drafts);
    addSection.disabled = available.length === 0;
    menu.replaceChildren();
    for (const key of available) {
      const item = document.createElement('li');
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'secondary';
      choice.textContent = optionalSections[key].title;
      choice.addEventListener('click', () => {
        if (!addOptionalSection(drafts, key)) return;
        const addEntry = appendSection(key);
        closeMenu();
        refreshMenu();
        onChange();
        addEntry.focus();
      });
      item.append(choice);
      menu.append(item);
    }
    if (!available.length) closeMenu();
  }
  function appendSection(key: OptionalSectionKey) {
    const definition = optionalSections[key];
    const entries = drafts[key]!;
    const rows: { draft: OptionalEntryDraft; root: HTMLFieldSetElement; legend: HTMLLegendElement; remove: HTMLButtonElement; dates: Map<string, ReturnType<typeof dateControl>> }[] = [];
    const section = document.createElement('section');
    section.className = 'card';
    const heading = document.createElement('div');
    heading.className = 'section-heading';
    const title = document.createElement('h2');
    title.id = `optional-${key}-title`;
    title.textContent = definition.title;
    section.setAttribute('aria-labelledby', title.id);
    const addEntry = document.createElement('button');
    addEntry.type = 'button';
    addEntry.className = 'secondary';
    addEntry.textContent = '＋ Add';
    addEntry.setAttribute('aria-label', `Add ${definition.entryLabel.toLowerCase()}`);
    heading.append(title, addEntry);
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = 'No entries yet. Add one whenever you are ready.';
    const list = document.createElement('div');
    const removeSection = document.createElement('button');
    removeSection.type = 'button';
    removeSection.className = 'secondary remove-section';
    removeSection.textContent = 'Remove section';
    removeSection.setAttribute('aria-label', `Remove ${definition.title.toLowerCase()} section`);
    removeSection.addEventListener('click', () => {
      if (entries.some(optionalEntryHasContent) && !window.confirm(`Remove ${definition.title} and all its entries from the draft? The file changes only when you save.`)) return;
      removeOptionalSection(drafts, key);
      rendered.delete(key);
      section.remove();
      closeMenu();
      refreshMenu();
      onChange();
      addSection.focus();
    });
    function refresh() {
      empty.hidden = entries.length > 0;
      rows.forEach((row, index) => {
        row.legend.textContent = `${definition.entryLabel} ${index + 1}`;
        row.remove.setAttribute('aria-label', `Remove ${definition.entryLabel.toLowerCase()} ${index + 1}`);
        if (definition.currentLabel) row.dates.get('endDate')?.setDisabled(row.draft.current);
        const errors = optionalDateErrors(key, row.draft);
        for (const [name, control] of row.dates) control.setError(errors[name]);
      });
    }
    function changed() { refresh(); onChange(); }
    function appendEntry(draft: OptionalEntryDraft) {
      const prefix = `entry-${crypto.randomUUID()}`;
      const root = document.createElement('fieldset');
      root.className = 'dated-entry';
      const legend = document.createElement('legend');
      const grid = document.createElement('div');
      grid.className = 'form-grid';
      const dates = new Map<string, ReturnType<typeof dateControl>>();
      for (const field of definition.fields) {
        const id = `${prefix}-${field.key}`;
        if (field.kind === 'date') {
          const control = dateControl(id, field.label, draft.text[field.key] ?? '', value => { draft.text[field.key] = value; changed(); });
          dates.set(field.key, control);
          grid.append(control.root);
          if (field.key === 'endDate' && definition.currentLabel) {
            const label = document.createElement('label');
            label.className = 'checkbox-label full-width';
            const current = document.createElement('input');
            current.type = 'checkbox';
            current.checked = draft.current;
            current.addEventListener('change', () => { draft.current = current.checked; changed(); });
            label.append(current, document.createTextNode(definition.currentLabel));
            grid.append(label);
          }
        } else if (field.kind === 'tags') {
          grid.append(tagControl(id, field.label, draft.tags[field.key]!, changed));
        } else {
          const wrapper = document.createElement('div');
          const multiline = field.kind === 'multiline' || field.kind === 'bullets';
          if (multiline) wrapper.className = 'full-width';
          const label = document.createElement('label');
          label.htmlFor = id;
          label.textContent = field.label;
          const input = multiline ? document.createElement('textarea') : document.createElement('input');
          input.id = id;
          input.value = draft.text[field.key] ?? '';
          if (input instanceof HTMLTextAreaElement) input.rows = 5;
          else input.type = field.kind === 'url' ? 'url' : 'text';
          input.addEventListener('input', () => { draft.text[field.key] = input.value; changed(); });
          wrapper.append(label, input);
          if (field.kind === 'bullets') {
            const hint = document.createElement('p');
            hint.id = `${id}-hint`;
            hint.className = 'note';
            hint.textContent = 'One item per line. Optional leading markers: - * + > < # •.';
            input.setAttribute('aria-describedby', hint.id);
            wrapper.append(hint);
          }
          grid.append(wrapper);
        }
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = `Remove ${definition.entryLabel.toLowerCase()}`;
      remove.addEventListener('click', () => {
        if (optionalEntryHasContent(draft) && !window.confirm(`Remove this ${definition.entryLabel.toLowerCase()} from the draft? The file changes only when you save.`)) return;
        entries.splice(entries.indexOf(draft), 1);
        rows.splice(rows.findIndex(row => row.draft === draft), 1);
        root.remove();
        changed();
        addEntry.focus();
      });
      root.append(legend, grid, remove);
      list.append(root);
      rows.push({ draft, root, legend, remove, dates });
      return root;
    }
    for (const draft of entries) appendEntry(draft);
    addEntry.addEventListener('click', () => {
      const draft = optionalEntryToDraft(key);
      entries.push(draft);
      const root = appendEntry(draft);
      changed();
      root.querySelector<HTMLInputElement>('input')?.focus();
    });
    section.append(heading, empty, list, removeSection);
    container.append(section);
    rendered.set(key, { root: section, refresh });
    refresh();
    return addEntry;
  }
  for (const key of optionalSectionKeys) if (drafts[key] !== undefined) appendSection(key);
  addSection.onclick = () => {
    if (!menu.hidden) { closeMenu(); return; }
    refreshMenu();
    if (addSection.disabled) return;
    menu.hidden = false;
    addSection.setAttribute('aria-expanded', 'true');
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  };
  controls.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); closeMenu(true); }
  });
  document.addEventListener('click', event => { if (!controls.contains(event.target as Node)) closeMenu(); });
  refreshMenu();
  return {
    focusFirstError() {
      for (const { refresh } of rendered.values()) refresh();
      const invalid = container.querySelector<HTMLInputElement>('[aria-invalid="true"]');
      invalid?.focus();
      return !!invalid;
    },
  };
}
