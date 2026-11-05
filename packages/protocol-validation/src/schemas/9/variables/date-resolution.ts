export const isIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Date.parse/UTC normalize impossible calendar dates (e.g. 2020-02-31 ->
  // 2020-03-02), so round-trip the components and require an exact match to
  // reject invalid days-of-month and out-of-range months. Built via
  // setUTCFullYear rather than Date.UTC(year, ...): Date.UTC (like the
  // multi-arg Date constructor) maps a 0-99 year into 1900-1999, which would
  // falsely reject a real four-digit year like '0099'; setUTCFullYear has no
  // such two-digit-year special case.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const DATE_RESOLUTION = {
  full: { label: 'YYYY-MM-DD', pattern: /^\d{4}-\d{2}-\d{2}$/, length: 10 },
  month: { label: 'YYYY-MM', pattern: /^\d{4}-\d{2}$/, length: 7 },
  year: { label: 'YYYY', pattern: /^\d{4}$/, length: 4 },
} as const;

export const isValidDateAtResolution = (
  value: string,
  resolution: keyof typeof DATE_RESOLUTION,
): boolean => {
  if (!DATE_RESOLUTION[resolution].pattern.test(value)) return false;
  if (resolution === 'year') return true;
  if (resolution === 'month') {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
  }
  return isIsoDate(value);
};
