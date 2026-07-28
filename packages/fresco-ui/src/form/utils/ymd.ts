// YYYY-MM-DD string helpers. `todayYmd` reads the clock in UTC so it names
// the same calendar day regardless of the runtime timezone — critical because
// `RelativeDatePickerField` and `buildDatePickerBoundProps` both default an
// undeclared anchor to it, and the form's min/max validators compare
// YYYY-MM-DD strings lexically; a local-time read would put this field's
// ceiling a day either side of every other date-aware part of the system near
// a DST transition or a timezone boundary.

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function todayYmd(): string {
  const now = new Date();
  return formatYmd(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
}
