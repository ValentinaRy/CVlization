/** Add one phrase, without splitting punctuation or changing existing file contents. */
export function withTag(tags: readonly string[], input: string): string[] {
  const value = input.trim();
  if (!value || tags.some(tag => tag.trim().toLowerCase() === value.toLowerCase())) return [...tags];
  return [...tags, value];
}
