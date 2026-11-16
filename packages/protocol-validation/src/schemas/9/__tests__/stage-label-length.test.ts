import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { MigrationResultInvalidError } from '../../../migration/errors.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import { STAGE_LABEL_MAX_LENGTH } from '../stages/base.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

/** The base protocol in English and French, its first stage named `label`. */
const withStageLabel = (label: Record<string, string>) => {
  const base = createBaseProtocol();
  const [first, ...rest] = base.stages;
  return withFinishStage({
    ...base,
    localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    stages: [{ ...first, label }, ...rest],
  });
};

/** What refuses `protocol`, even while it is being written. */
const draftIssues = async (protocol: unknown) => {
  const result = await validateProtocol(protocol, { draft: true });
  return result.success ? [] : result.error.issues;
};

const longest = 'x'.repeat(STAGE_LABEL_MAX_LENGTH);

describe('a stage name', () => {
  it(`may be ${STAGE_LABEL_MAX_LENGTH} characters long`, async () => {
    expect(await draftIssues(withStageLabel({ en: longest }))).toEqual([]);
  });

  it('may not be longer in any language, even in a protocol being written', async () => {
    const name = `${longest}y`;
    expect(
      await draftIssues(withStageLabel({ en: 'Names', fr: name })),
    ).toEqual([
      expect.objectContaining({
        path: ['stages', 0, 'label', 'fr'],
        message: `Stage name "${name}" is 101 characters long, but a stage name may be at most 100.`,
      }),
    ]);
  });

  // Stored as a message, where a brace is quoted: `'{'` is one character a
  // reader sees.
  it('is measured as a reader sees it, not as it is stored', async () => {
    const quoted = `'{'${'x'.repeat(STAGE_LABEL_MAX_LENGTH - 1)}`;
    expect(quoted.length).toBeGreaterThan(STAGE_LABEL_MAX_LENGTH);
    expect(await draftIssues(withStageLabel({ en: quoted }))).toEqual([]);
  });

  it('is one line as well as no longer than that', async () => {
    expect(
      await draftIssues(withStageLabel({ en: 'Names', fr: 'Les\nnoms' })),
    ).toEqual([
      expect.objectContaining({
        path: ['stages', 0, 'label', 'fr'],
        message: 'Text cannot contain a line break.',
      }),
    ]);
    expect(
      (await draftIssues(withStageLabel({ en: `${longest}\ny` }))).map(
        ({ message }) => message,
      ),
    ).toEqual([
      `Stage name "${longest}\ny" is 102 characters long, but a stage name may be at most 100.`,
      'Text cannot contain a line break.',
    ]);
  });

  it('holds the stage that ends the interview to the same length', async () => {
    const protocol = withStageLabel({ en: 'Names' });
    const finish = protocol.stages.at(-1);
    if (finish === undefined) throw new Error('No finish stage');
    Object.assign(finish, { label: { en: `${longest}y` } });
    expect(await draftIssues(protocol)).toEqual([
      expect.objectContaining({
        path: ['stages', protocol.stages.length - 1, 'label', 'en'],
      }),
    ]);
  });

  // Network Canvas does not shorten a name: the researcher does, in the
  // version of Architect that made the protocol.
  it('refuses a schema 8 protocol with a longer one, naming the stage', () => {
    const name =
      'A name generator for everyone the participant knows well, has known for a year, and sees every single week';
    expect(name.length).toBeGreaterThan(STAGE_LABEL_MAX_LENGTH);
    const document = asSchema8Protocol(withStageLabel({ en: name }));
    expect(() => migrateProtocol(document, 9)).toThrow(
      MigrationResultInvalidError,
    );
    expect(() => migrateProtocol(document, 9)).toThrow(
      `Stage name \\"${name}\\" is ${name.length} characters long`,
    );
  });
});
