import type { Observation } from './model';

const nativeControls = new Set(['input', 'textarea', 'select', 'button']);
const interactiveRoles = new Set(['textbox', 'combobox', 'checkbox', 'radio', 'switch', 'spinbutton', 'slider', 'button']);
const optionRoles = new Set(['option', 'listbox', 'menu', 'menuitem', 'tree', 'treeitem']);

/** Filter annotation panels, never the source observation or persisted labels. */
export function showAnnotation(node: Observation, positioned: boolean, alreadyLabeled: boolean): boolean {
  if (!node.control) return false;
  // Existing labels must remain inspectable and editable, including older examples.
  if (alreadyLabeled) return true;
  const role = node.attributes.role ?? '';
  const interactive = nativeControls.has(node.tag) || interactiveRoles.has(role) || node.control.kind === 'contenteditable';
  // A dropdown's options belong to its owning field, not separate profile values.
  if (!nativeControls.has(node.tag) && (optionRoles.has(role) || (['ul', 'ol', 'li'].includes(node.tag) && !interactive))) return false;
  return positioned || interactive;
}
