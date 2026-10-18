import { debugTheme } from './theme';
import { controlKinds, dateParts, elements, meanings, repeatedMeaning } from './model';
import type { Capture, Annotations, Label, Observation } from './model';

export const annotationCss = `${debugTheme}.cvl-annotation{display:flex!important;position:static!important;flex-wrap:wrap!important;align-items:center!important;gap:8px!important;clear:both!important;margin:8px 0!important;padding:10px!important;border:3px solid var(--debug-border)!important;border-radius:10px!important;background:var(--debug-surface)!important;color:var(--debug-text)!important;font:13px/1.4 system-ui!important;min-width:220px!important;max-width:100%!important;box-sizing:border-box!important;pointer-events:auto!important}.cvl-annotation label{display:flex!important;flex-direction:column!important;color:var(--debug-text)!important;font:12px/1.4 system-ui!important;max-width:100%!important}.cvl-annotation select{font:13px system-ui!important;background:var(--debug-input)!important;color:var(--debug-text)!important;border:1px solid var(--debug-border)!important;border-radius:6px!important;padding:6px!important;max-width:260px!important;width:auto!important}.cvl-annotation select:focus{outline:3px solid var(--debug-focus)!important}.cvl-annotation [hidden]{display:none!important}.cvl-annotation small{width:100%;overflow-wrap:anywhere}`;

export function mountAnnotations(capture: Capture, labels: Annotations['labels'], doc: Document, hidden: HTMLElement, changed: () => void) {
  const style = doc.createElement('style'); style.textContent = annotationCss; doc.head.append(style);
  // Only the annotation view reflows. Captured layout evidence remains immutable.
  for (const container of doc.querySelectorAll<HTMLElement>('[data-observation-id]')) {
    if (!['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'OPTION'].includes(container.tagName)) container.style.height = 'auto';
  }
  hidden.replaceChildren();
  doc.addEventListener('submit', event => event.preventDefault());
  for (const node of elements(capture.page.tree).filter(item => item.control)) {
    const target = doc.querySelector<HTMLElement>(`[data-observation-id="${node.id}"]`);
    const positioned = node.visible && target && target.getClientRects().length > 0;
    const owner = positioned ? doc : hidden.ownerDocument;
    const panel = makePanel(owner, node, labels, changed);
    if (positioned) {
      panel.style.gridColumn = '1 / -1'; panel.style.flexBasis = '100%';
      if (target.parentElement) target.parentElement.style.flexWrap = 'wrap';
      target.after(panel);
    } else hidden.append(panel);
  }
}
function makePanel(doc: Document, node: Observation, labels: Annotations['labels'], changed: () => void) {
  const panel = doc.createElement('div'); panel.className = 'cvl-annotation';
  const description = doc.createElement('small');
  description.textContent = `${node.id} · ${node.tag} ${node.attributes.type ?? ''} · ${node.control!.labels.join(' / ') || node.attributes['aria-label'] || node.attributes.placeholder || node.attributes.name || '(no label)'}`;
  panel.append(description);
  const addSelect = (title: string, choices: [string, string][], value: string) => {
    const label = doc.createElement('label'); label.textContent = title;
    const select = doc.createElement('select'); select.setAttribute('aria-label', `${title} for ${node.id}`);
    for (const [key, text] of choices) { const option = doc.createElement('option'); option.value = key; option.textContent = text; select.append(option); }
    select.value = value; label.append(select); panel.append(label); return select;
  };
  const initial = labels[node.id];
  const meaning = addSelect('Meaning', [['', 'Unmarked'], ...Object.entries(meanings)], initial?.meaning ?? '');
  const kind = addSelect('Control', controlKinds.map(value => [value, value]), initial?.kind ?? (controlKinds.includes(node.control!.kind as Label['kind']) ? node.control!.kind : 'other'));
  const record = addSelect('Record', [1, 2, 3].map(value => [String(value), String(value)]), String(initial?.record ?? 1));
  const datePart = addSelect('Date component', dateParts.map(value => [value, value]), initial?.datePart ?? 'whole');
  const visibility = () => {
    record.parentElement!.hidden = !repeatedMeaning(meaning.value);
    datePart.parentElement!.hidden = !/Date$/.test(meaning.value) && kind.value !== 'date';
  };
  for (const select of [meaning, kind, record, datePart]) select.addEventListener('change', () => {
    visibility();
    if (!meaning.value) delete labels[node.id];
    else {
      const label: Label = { meaning: meaning.value, kind: kind.value as Label['kind'] };
      if (repeatedMeaning(meaning.value)) label.record = Number(record.value);
      if (!datePart.parentElement!.hidden) label.datePart = datePart.value as Label['datePart'];
      labels[node.id] = label;
    }
    changed();
  });
  visibility(); return panel;
}
