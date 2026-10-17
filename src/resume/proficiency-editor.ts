import { tagControl } from './tag-control';
import type { TagDraft } from './tag-control';

type ProficiencyDraft = { id: string; name: string; level: string; source: Record<string, unknown>; keywords?: TagDraft };

export function proficiencyEditor<T extends ProficiencyDraft>(
  container: HTMLElement,
  add: HTMLButtonElement,
  drafts: T[],
  create: () => T,
  options: { singular: string; plural: string; levels: readonly string[] },
  onChange: () => void,
) {
  const rows: { draft: T; root: HTMLFieldSetElement; legend: HTMLLegendElement; remove: HTMLButtonElement }[] = [];
  container.replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'note';
  empty.textContent = `No ${options.plural.toLowerCase()} yet. Add one whenever you are ready.`;
  container.append(empty);
  function refresh() {
    empty.hidden = drafts.length > 0;
    rows.forEach((row, index) => {
      row.legend.textContent = `${options.singular} ${index + 1}`;
      row.remove.setAttribute('aria-label', `Remove ${options.singular.toLowerCase()} ${index + 1}`);
    });
  }
  function append(draft: T) {
    const prefix = `proficiency-${crypto.randomUUID()}`;
    const root = document.createElement('fieldset');
    root.className = 'proficiency-entry';
    const legend = document.createElement('legend');
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    const nameWrapper = document.createElement('div');
    const nameLabel = document.createElement('label');
    const name = document.createElement('input');
    name.type = 'text';
    name.autocomplete = 'off';
    name.id = nameLabel.htmlFor = `${prefix}-name`;
    nameLabel.textContent = 'Name';
    name.value = draft.name;
    name.addEventListener('input', () => { draft.name = name.value; onChange(); });
    nameWrapper.append(nameLabel, name);
    const levelWrapper = document.createElement('div');
    const levelLabel = document.createElement('label');
    const level = document.createElement('select');
    level.id = levelLabel.htmlFor = `${prefix}-level`;
    levelLabel.textContent = 'Level';
    level.add(new Option('Not specified', ''));
    for (const value of options.levels) level.add(new Option(value, value));
    // Older or hand-edited files can contain a different self-description.
    if (draft.level && !options.levels.includes(draft.level)) level.add(new Option(`Existing: ${draft.level}`, draft.level));
    level.value = draft.level;
    level.addEventListener('change', () => { draft.level = level.value; onChange(); });
    levelWrapper.append(levelLabel, level);
    grid.append(nameWrapper, levelWrapper);
    if (draft.keywords) grid.append(tagControl(`${prefix}-keywords`, 'Keywords', draft.keywords, onChange));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = `Remove ${options.singular.toLowerCase()}`;
    remove.addEventListener('click', () => {
      const populated = draft.name.trim() || draft.level.trim() || draft.keywords?.values.length || draft.keywords?.input.trim() || Object.keys(draft.source).some(key => key !== 'id');
      if (populated && !window.confirm(`Remove this ${options.singular.toLowerCase()} from the draft? The file changes only when you save.`)) return;
      drafts.splice(drafts.indexOf(draft), 1);
      rows.splice(rows.findIndex(row => row.draft === draft), 1);
      root.remove();
      refresh();
      onChange();
      add.focus();
    });
    root.append(legend, grid, remove);
    container.append(root);
    rows.push({ draft, root, legend, remove });
    return name;
  }
  for (const draft of drafts) append(draft);
  add.onclick = () => {
    const draft = create();
    drafts.push(draft);
    const name = append(draft);
    refresh();
    onChange();
    name.focus();
  };
  refresh();
}
