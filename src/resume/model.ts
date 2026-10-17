import { validateSkillsLanguages } from './skills-languages';
import type { SkillEntry, LanguageEntry } from './skills-languages';
import { validateEducationEntries } from './education';
import type { EducationEntry } from './education';
import { validateWorkEntries } from './work';
import type { WorkEntry } from './work';
export const basicFields = ['firstName', 'lastName', 'label', 'email', 'phoneCountryCode', 'phoneNumber', 'url', 'summary'] as const;
export const locationFields = ['address', 'postalCode', 'city', 'country', 'region'] as const;
export const profileFields = ['network', 'username', 'url'] as const;
type JsonObject = Record<string, unknown>;
export type Profile = JsonObject & { network?: string; username?: string; url?: string };
export type Basics = JsonObject & Partial<Record<typeof basicFields[number] | 'name' | 'phone' | 'image', string>> & {
  location?: JsonObject & Partial<Record<typeof locationFields[number] | 'countryCode', string>>;
  profiles?: Profile[];
};
export type Resume = JsonObject & { schemaVersion: 1; id: string; basics: Basics; work?: WorkEntry[]; education?: EducationEntry[]; skills?: SkillEntry[]; languages?: LanguageEntry[] };
export type BasicsDraft = Record<typeof basicFields[number], string> & {
  location: Record<typeof locationFields[number], string>;
  profiles: Profile[];
};

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function checkStrings(value: JsonObject, fields: readonly string[], path: string) {
  for (const key of fields) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      throw new Error(`${path}.${key} must be text. The file has not been changed.`);
    }
  }
}

export function parseResume(text: string): Resume {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('This file is not valid JSON. Fix it on disk before opening it again.'); }
  if (!object(value)) throw new Error('A resume must be a JSON object.');
  if (value.schemaVersion === undefined) {
    throw new Error('This is not a versioned CVlization resume. Importing external JSON Resume files is planned separately.');
  }
  if (value.schemaVersion !== 1) throw new Error('This resume version is not supported. The file has not been changed.');
  if (typeof value.id !== 'string' || !value.id.trim() || !object(value.basics)) {
    throw new Error('This resume needs an id and a basics object. The file has not been changed.');
  }
  checkStrings(value.basics, [...basicFields, 'name', 'phone', 'image'], 'basics');
  if (value.basics.location !== undefined) {
    if (!object(value.basics.location)) throw new Error('basics.location must be an object.');
    checkStrings(value.basics.location, [...locationFields, 'countryCode'], 'basics.location');
  }
  if (value.basics.profiles !== undefined) {
    if (!Array.isArray(value.basics.profiles)) throw new Error('basics.profiles must be a list.');
    value.basics.profiles.forEach((profile: unknown, i: number) => {
      if (!object(profile)) throw new Error(`basics.profiles[${i}] must be an object.`);
      checkStrings(profile, profileFields, `basics.profiles[${i}]`);
    });
  }
  for (const section of ['work', 'education', 'skills', 'languages', 'volunteer', 'awards', 'certificates', 'publications', 'interests', 'references', 'projects']) {
    const entries = value[section];
    if (entries !== undefined && (!Array.isArray(entries) || !entries.every(object))) {
      throw new Error(`${section} must be a list of objects. The file has not been changed.`);
    }
  }
  if (Array.isArray(value.work)) validateWorkEntries(value.work);
  if (Array.isArray(value.education)) validateEducationEntries(value.education);
  if (Array.isArray(value.skills)) validateSkillsLanguages(value.skills, 'skills');
  if (Array.isArray(value.languages)) validateSkillsLanguages(value.languages, 'languages');
  return value as Resume;
}

export function newResume(id: string = crypto.randomUUID()): Resume {
  return { schemaVersion: 1, id, basics: {} };
}
export function toDraft(resume: Resume): BasicsDraft {
  return {
    ...Object.fromEntries(basicFields.map(key => [key, resume.basics[key] ?? ''])),
    location: Object.fromEntries(locationFields.map(key => [key, resume.basics.location?.[key] ?? ''])),
    profiles: structuredClone(resume.basics.profiles ?? []),
  } as BasicsDraft;
}
function setText(target: JsonObject, key: string, value: string) {
  if (value.trim()) target[key] = value.trim();
  else delete target[key];
}
export function combinedName(draft: BasicsDraft): string {
  return [draft.firstName.trim(), draft.lastName.trim()].filter(Boolean).join(' ');
}
export function combinedPhone(draft: BasicsDraft): string {
  return draft.phoneCountryCode.trim() + draft.phoneNumber.trim();
}

export function applyBasics(resume: Resume, draft: BasicsDraft): Resume {
  const result = structuredClone(resume);
  const basics = result.basics;
  for (const key of basicFields) setText(basics, key, draft[key]);
  // Preserve a full value from a hand-edited file until components have been supplied.
  // Never guess how to split a person's name or an international phone number.
  const name = combinedName(draft);
  if (name || resume.basics.firstName !== undefined || resume.basics.lastName !== undefined) setText(basics, 'name', name);
  const phone = combinedPhone(draft);
  if (phone || resume.basics.phoneCountryCode !== undefined || resume.basics.phoneNumber !== undefined) setText(basics, 'phone', phone);
  const location: JsonObject = { ...basics.location };
  for (const key of locationFields) setText(location, key, draft.location[key]);
  // Keep older codes when the country is untouched, but never retain a stale code
  // after a free-text country change. Country selection/derivation is a later task.
  if (draft.location.country.trim() !== (resume.basics.location?.country ?? '').trim()) delete location.countryCode;
  if (Object.keys(location).length) basics.location = location;
  else delete basics.location;
  const profiles = draft.profiles.map(profile => {
    const result = { ...profile };
    for (const key of profileFields) setText(result, key, profile[key] ?? '');
    return result;
  }).filter(profile => Object.keys(profile).length > 0);
  if (profiles.length) basics.profiles = profiles;
  else delete basics.profiles;
  return result;
}

export function draftWarnings(draft: BasicsDraft): string[] {
  const warnings: string[] = [];
  if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    warnings.push('Check the email address. You can still save this draft.');
  }
  for (const [label, value] of [
    ['Website', draft.url],
    ...draft.profiles.map((p, i) => [`Profile ${i + 1} URL`, p.url ?? '']),
  ]) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(value.trim());
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
    } catch { warnings.push(`${label}: enter a full http:// or https:// address when ready.`); }
  }
  if (draft.phoneCountryCode.trim() && !/^\+[1-9]\d{0,2}$/.test(draft.phoneCountryCode.trim())) {
    warnings.push('Check the phone country code, for example +49.');
  }
  if (draft.phoneCountryCode.trim() && !draft.phoneNumber.trim()) warnings.push('The phone country code has no phone number yet.');
  return warnings;
}
