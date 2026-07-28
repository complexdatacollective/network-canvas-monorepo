// YYYY-MM-DD string helpers. Arithmetic runs in UTC so derived bounds are
// stable regardless of the runtime timezone — critical because the form's
// min/max validators compare YYYY-MM-DD strings lexically; any drift would
// introduce off-by-one-day validation errors near DST transitions or across
// timezone boundaries.

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// `Date.UTC`, like the multi-argument `Date` constructor, maps a year of 0-99
// into 1900-1999. This input accepts dates from year 0001, so a bound derived
// from an anchor such as '0099-01-01' would otherwise be built around 1999 —
// and the generator, which keeps its own copy of this arithmetic, would place
// its dates a whole era away from the window this field validates against.
// `setUTCFullYear` reads the year literally.
function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function addDays(ymd: string, days: number): string {
  const parts = ymd.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) {
    return ymd;
  }
  const date = utcDate(year, month, day);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function todayYmd(): string {
  const now = new Date();
  return formatYmd(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
}
