// An update is dated as precisely as what is known about it: a year (`2013`),
// a month (`2016-07`) or a day (`2020-12-15`). All three are valid `<time>`
// values, and they sort correctly as strings: a year sorts before every month
// and day within it, so a year-only update follows that year's dated ones on
// a newest-first page.

type UpdateDatePrecision = 'year' | 'month' | 'day';

const UPDATE_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

function readUpdateDate(
  value: string,
): { date: Date; precision: UpdateDatePrecision } | undefined {
  const match = UPDATE_DATE.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const iso = `${year}-${month ?? '01'}-${day ?? '01'}`;
  const date = new Date(`${iso}T00:00:00Z`);
  // `new Date` rolls an impossible day such as 02-30 into the next month.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    return undefined;
  }
  return { date, precision: day ? 'day' : month ? 'month' : 'year' };
}

export function isUpdateDate(value: string) {
  return readUpdateDate(value) !== undefined;
}

export function parseUpdateDate(value: string) {
  const parsed = readUpdateDate(value);
  if (!parsed) throw new Error(`${value}: not an update date`);
  return parsed;
}
