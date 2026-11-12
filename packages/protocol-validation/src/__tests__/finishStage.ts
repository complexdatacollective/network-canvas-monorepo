import { withInterfaceText } from '../schemas/9/interface-text.ts';

/**
 * Test support: a schema 9 protocol must end at a finish stage and hold the
 * interface text it uses, so a fixture written to exercise something else
 * gains a finish stage at the end, with its text in every language the
 * fixture declares (so it adds no missing translation), and then the
 * interface text it uses (`withInterfaceText`), keeping any it already holds.
 * A fixture with no stage list is returned as it is; one that already ends at
 * a finish stage gains only the interface text.
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
  mode: 'confirmation' as const,
  label: textIn(locales, 'Finish'),
  content: textIn(locales, '# Finish\n\nThe end.'),
  finishedContent: textIn(locales, '# Finished\n\nThank you.'),
  finishLabel: textIn(locales, 'Finish'),
  finishConfirmation: textIn(locales, 'Finish the interview?'),
  finishFailed: textIn(locales, 'The interview could not be finished.'),
  outcome: 'completed' as const,
});

const endsAtFinishStage = (stages: readonly unknown[]) => {
  const last: unknown = stages.at(-1);
  return (
    typeof last === 'object' &&
    last !== null &&
    'type' in last &&
    last.type === 'FinishSession'
  );
};

/** The fixture holding the interface text it uses, when it declares languages. */
const withFixtureInterfaceText = <T>(protocol: T): T => {
  const fixture = protocol as FixtureLike;
  const localization = fixture.localization;
  if (
    localization?.defaultLocale === undefined ||
    localization.locales === undefined
  ) {
    return protocol;
  }
  return withInterfaceText({
    ...fixture,
    stages: fixture.stages as readonly unknown[],
    localization: {
      defaultLocale: localization.defaultLocale,
      locales: localization.locales,
    },
  }) as T;
};

export const withFinishStage = <T>(protocol: T): T => {
  const fixture = protocol as FixtureLike;
  if (!Array.isArray(fixture.stages)) return protocol;
  if (endsAtFinishStage(fixture.stages)) {
    return withFixtureInterfaceText(protocol);
  }
  const locales = fixture.localization?.locales ?? [
    fixture.localization?.defaultLocale ?? 'en',
  ];
  return withFixtureInterfaceText({
    ...protocol,
    stages: [...fixture.stages, testFinishStage(locales)],
  });
};
