/**
 * Test support: a schema 9 protocol must end at a finish stage, so a fixture
 * written to exercise something else gains one at the end, with its text in
 * every language the fixture declares (so it adds no missing translation).
 * A fixture that already ends at a finish stage, or has no stage list, is
 * returned as it is.
 */
const TEST_FINISH_STAGE_ID = 'test-finish';

type FixtureLike = {
  stages?: unknown;
  localization?: { locales?: readonly string[]; defaultLocale?: string };
};

const textIn = (locales: readonly string[], text: string) =>
  Object.fromEntries(locales.map((locale) => [locale, text]));

const testFinishStage = (locales: readonly string[] = ['en']) => ({
  id: TEST_FINISH_STAGE_ID,
  type: 'FinishSession' as const,
  label: textIn(locales, 'Finish'),
  title: textIn(locales, 'Finish'),
  content: textIn(locales, 'The end.'),
  finishLabel: textIn(locales, 'Finish'),
  finishConfirmation: textIn(locales, 'Finish the interview?'),
  finishedNotice: textIn(locales, 'This interview is finished.'),
  finishFailed: textIn(locales, 'The interview could not be finished.'),
  outcome: 'completed' as const,
});

export const withFinishStage = <T>(protocol: T): T => {
  const fixture = protocol as FixtureLike;
  if (!Array.isArray(fixture.stages)) return protocol;
  const last: unknown = fixture.stages.at(-1);
  if (
    typeof last === 'object' &&
    last !== null &&
    'type' in last &&
    last.type === 'FinishSession'
  ) {
    return protocol;
  }
  const locales = fixture.localization?.locales ?? [
    fixture.localization?.defaultLocale ?? 'en',
  ];
  return {
    ...protocol,
    stages: [...fixture.stages, testFinishStage(locales)],
  };
};
