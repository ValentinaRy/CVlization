/** Calendar dates only: no timezone conversion and no limits relative to today. */
export function normalizeDate(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) throw new Error('Use YYYY-MM-DD or YYYY-MM.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] ?? '01');
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) {
    throw new Error('Enter a real calendar date.');
  }
  return `${match[1]}-${match[2]}-${match[3] ?? '01'}`;
}
