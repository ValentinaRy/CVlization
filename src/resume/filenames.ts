export function filenameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}
export function filenameError(base: string): string | undefined {
  if (!base.trim()) return 'Enter a filename.';
  if (base !== base.trim() || base.endsWith('.')) return 'Do not start or end the filename with spaces or end it with a dot.';
  if (!/^[\p{L}\p{M}\p{N} _.-]+$/u.test(base) || base.startsWith('.')) {
    return 'Use letters, numbers, spaces, hyphens, underscores, or dots inside the name. Do not use slashes or other special characters.';
  }
  if (/\.json$/i.test(base)) return 'Enter the name without .json; it is added automatically.';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) return 'This filename is reserved. Choose another name.';
  if (new TextEncoder().encode(base).length > 200) return 'Use a shorter filename (at most 200 UTF-8 bytes).';
  return undefined;
}
export function suggestedFilename(entries: readonly string[]): string {
  const used = new Set(entries.map(filenameKey));
  let base = 'resume';
  for (let i = 2; used.has(filenameKey(`${base}.json`)); i++) base = `resume-${i}`;
  return base;
}
export function assertAvailable(base: string, entries: readonly string[], originalName?: string) {
  const error = filenameError(base);
  if (error) throw new Error(error);
  const target = `${base}.json`;
  if (target !== originalName && entries.some(name => filenameKey(name) === filenameKey(target))) {
    throw new Error('This filename already exists. Choose another name; existing files are never replaced by a new resume.');
  }
}
