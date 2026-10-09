import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { analyzeProtocolLocalization } from '../../../localization/analyzeProtocolLocalization.ts';
import type { MessageArguments } from '../../../localization/messageArguments.ts';
import { resolveLocalizedString } from '../../../localization/resolveLocalizedString.ts';
import {
  collectLocalizedStrings,
  collectLocalizedStringsFromSchema,
} from '../../../utils/collectLocalizedStrings.ts';
import { localized } from '../../../utils/test-utils.ts';
import {
  type LocalizedStringFormat,
  localizedString,
} from '../localized-string.ts';
import ProtocolSchemaV9 from '../schema.ts';
import {
  PEDIGREE_PARENTS_ARGUMENTS,
  PEDIGREE_PERSON_ARGUMENTS,
} from '../stages/family-pedigree.ts';
import { NODE_COUNT_ARGUMENTS } from '../stages/name-generator.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

type Path = readonly (string | number)[];

type ExpectedSite = Readonly<{
  path: Path;
  format: LocalizedStringFormat;
  // Whether the field's own rule allows an empty translation.
  allowsEmpty: boolean;
  // Whether the field may have no translation at all: only the finish
  // stage's text, which a new protocol in a language Network Canvas supplies
  // none for starts without (`findFinishStageTextProblems`).
  allowsNoTranslation: boolean;
  // What a localized message may use; absent for literal text.
  arguments?: MessageArguments;
}>;

const site = (
  path: Path,
  format: LocalizedStringFormat,
  allowsEmpty = false,
  allowsNoTranslation = false,
): ExpectedSite => ({ path, format, allowsEmpty, allowsNoTranslation });

const messageSite = (
  path: Path,
  declaration: MessageArguments,
): ExpectedSite => ({
  ...site(path, 'plain'),
  arguments: declaration,
});

const FINISH_STAGE_INDEX = 20;

const person = ['codebook', 'node', 'person'] as const;
const personVariable = (id: string) => [...person, 'variables', id] as const;
const knowsVariable = (id: string) =>
  ['codebook', 'edge', 'knows', 'variables', id] as const;
const stage = (index: number, ...rest: (string | number)[]) => [
  'stages',
  index,
  ...rest,
];

const EXPECTED_SITES: readonly ExpectedSite[] = [
  // Codebook entity type labels, and variable option copy.
  site([...person, 'label'], 'plain'),
  site([...personVariable('category'), 'options', 0, 'label'], 'markdown'),
  site([...personVariable('category'), 'options', 1, 'label'], 'markdown'),
  site([...personVariable('strength'), 'options', 0, 'label'], 'markdown'),
  site([...personVariable('strength'), 'options', 1, 'label'], 'markdown'),
  site(
    [...personVariable('closeness'), 'parameters', 'minLabel'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('closeness'), 'parameters', 'maxLabel'],
    'markdown',
    true,
  ),
  site([...personVariable('flag'), 'options', 0, 'label'], 'markdown'),
  site([...personVariable('flag'), 'options', 1, 'label'], 'markdown'),
  site(['codebook', 'node', 'relative', 'label'], 'plain'),
  // The answers a Family Pedigree asks for, which participants choose from,
  // so none may be blank.
  ...Array.from({ length: 5 }, (_, index) =>
    site(
      [
        'codebook',
        'node',
        'relative',
        'variables',
        'sex',
        'options',
        index,
        'label',
      ],
      'markdown',
    ),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    site(
      [
        'codebook',
        'node',
        'relative',
        'variables',
        'relativesNotRecorded',
        'options',
        index,
        'label',
      ],
      'markdown',
    ),
  ),
  site(['codebook', 'edge', 'knows', 'label'], 'plain'),
  site([...knowsVariable('tieStrength'), 'options', 0, 'label'], 'markdown'),
  site([...knowsVariable('tieStrength'), 'options', 1, 'label'], 'markdown'),
  site(['codebook', 'edge', 'family', 'label'], 'plain'),
  ...Array.from({ length: 6 }, (_, index) =>
    site(
      [
        'codebook',
        'edge',
        'family',
        'variables',
        'relType',
        'options',
        index,
        'label',
      ],
      'markdown',
    ),
  ),

  // Every stage's label.
  ...Array.from({ length: 21 }, (_, index) =>
    site(stage(index, 'label'), 'plain', false, index === FINISH_STAGE_INDEX),
  ),

  site(stage(1, 'title'), 'plain'),
  site(stage(1, 'items', 0, 'content'), 'markdown'),
  site(stage(1, 'items', 1, 'description'), 'plain', true),

  site(stage(2, 'introductionPanel', 'title'), 'plain'),
  site(stage(2, 'introductionPanel', 'text'), 'markdown'),
  site(stage(2, 'form', 'fields', 0, 'prompt'), 'markdown'),
  site(stage(2, 'form', 'fields', 0, 'hint'), 'markdown', true),

  site(stage(3, 'form', 'title'), 'plain'),
  site(stage(3, 'form', 'fields', 0, 'prompt'), 'markdown'),
  messageSite(stage(3, 'minNodesNotice'), NODE_COUNT_ARGUMENTS),
  site(stage(3, 'maxNodesNotice'), 'plain'),
  site(stage(3, 'externalDataError'), 'plain'),
  site(stage(3, 'panels', 0, 'title'), 'plain'),
  site(stage(3, 'panels', 1, 'title'), 'plain'),
  site(stage(3, 'prompts', 0, 'text'), 'markdown'),

  site(stage(4, 'quickAddHint'), 'plain'),
  site(stage(4, 'prompts', 0, 'text'), 'markdown'),

  site(stage(5, 'panelTitle'), 'plain'),
  messageSite(stage(5, 'minNodesNotice'), NODE_COUNT_ARGUMENTS),
  site(stage(5, 'maxNodesNotice'), 'plain'),
  site(stage(5, 'externalDataError'), 'plain'),
  site(stage(5, 'allAddedNotice'), 'plain'),
  site(stage(5, 'searchLabel'), 'plain'),
  site(stage(5, 'searchNoMatch'), 'plain'),
  site(stage(5, 'cardOptions', 'additionalProperties', 0, 'label'), 'plain'),
  site(stage(5, 'sortOptions', 'sortableProperties', 0, 'label'), 'plain'),
  site(stage(5, 'prompts', 0, 'text'), 'markdown'),

  site(stage(6, 'prompts', 0, 'text'), 'markdown'),

  // The composer's own scale end labels are separate sites from the codebook
  // scalar's, and override them.
  site(stage(7, 'nodeForm', 'fields', 0, 'label'), 'markdown'),
  site(stage(7, 'nodeForm', 'fields', 0, 'hint'), 'markdown', true),
  site(
    stage(7, 'nodeForm', 'fields', 0, 'parameters', 'minLabel'),
    'markdown',
    true,
  ),
  site(
    stage(7, 'nodeForm', 'fields', 0, 'parameters', 'maxLabel'),
    'markdown',
    true,
  ),
  site(stage(7, 'nodeForm', 'fields', 1, 'label'), 'markdown'),
  site(stage(7, 'edges', 0, 'form', 'fields', 0, 'label'), 'markdown'),

  site(stage(8, 'introductionPanel', 'title'), 'plain'),
  site(stage(8, 'introductionPanel', 'text'), 'markdown'),
  site(stage(8, 'form', 'fields', 0, 'prompt'), 'markdown'),

  site(stage(9, 'introductionPanel', 'title'), 'plain'),
  site(stage(9, 'introductionPanel', 'text'), 'markdown'),
  site(stage(9, 'form', 'fields', 0, 'prompt'), 'markdown'),

  site(stage(10, 'introductionPanel', 'title'), 'plain'),
  site(stage(10, 'introductionPanel', 'text'), 'markdown'),
  site(stage(10, 'prompts', 0, 'text'), 'markdown'),

  site(stage(11, 'introductionPanel', 'title'), 'plain'),
  site(stage(11, 'introductionPanel', 'text'), 'markdown'),
  site(stage(11, 'prompts', 0, 'text'), 'markdown'),
  site(stage(11, 'prompts', 0, 'negativeLabel'), 'markdown'),

  site(stage(12, 'prompts', 0, 'text'), 'markdown'),

  site(stage(13, 'prompts', 0, 'text'), 'markdown'),
  site(stage(13, 'prompts', 0, 'otherVariablePrompt'), 'markdown'),
  site(stage(13, 'prompts', 0, 'otherOptionLabel'), 'markdown'),

  site(stage(14, 'presets', 0, 'label'), 'plain'),
  site(stage(14, 'presets', 0, 'highlight', 0, 'label'), 'plain'),

  site(stage(15, 'explanationText', 'title'), 'plain'),
  site(stage(15, 'explanationText', 'body'), 'markdown'),

  site(stage(16, 'prompts', 0, 'text'), 'markdown'),

  site(stage(17, 'prompts', 0, 'text'), 'markdown'),
  site(stage(17, 'offlineNotice'), 'plain'),
  site(stage(17, 'mapUnavailable'), 'plain'),
  site(stage(17, 'outsideAreasLabel'), 'plain'),
  site(stage(17, 'searchLabel'), 'plain'),
  site(stage(17, 'searchNoMatch'), 'plain'),
  site(stage(17, 'searchFailed'), 'plain'),

  site(stage(18, 'prompt'), 'markdown'),
  // The Family Pedigree's own wording, which Network Canvas supplies.
  site(stage(18, 'nodeConfiguration', 'nameField', 'prompt'), 'plain'),
  site(stage(18, 'nodeConfiguration', 'nameField', 'hint'), 'plain'),
  ...(
    [
      ['parents', 'listItem'],
      ['siblings', 'listItem'],
      ['siblings', 'noneButton'],
      ['siblings', 'question'],
      ['children', 'listItem'],
      ['children', 'noneButton'],
      ['children', 'question'],
      ['details', 'listItem'],
    ] as const
  ).map((path) =>
    messageSite(
      stage(18, 'completeness', 'itemText', ...path),
      path[0] === 'parents'
        ? PEDIGREE_PARENTS_ARGUMENTS
        : PEDIGREE_PERSON_ARGUMENTS,
    ),
  ),
  site(stage(18, 'completeness', 'recommendedNote'), 'plain'),
  site(stage(18, 'form', 'fields', 0, 'prompt'), 'markdown'),
  site(stage(18, 'form', 'fields', 0, 'hint'), 'markdown', true),
  site(stage(18, 'nominationPrompts', 0, 'text'), 'markdown'),

  site(stage(19, 'diseases', 0, 'label'), 'plain'),

  // The finish stage's title and content are markdown, so a researcher can
  // emphasise a word in either.
  site(stage(FINISH_STAGE_INDEX, 'title'), 'markdown', false, true),
  site(stage(FINISH_STAGE_INDEX, 'content'), 'markdown', false, true),
  // The interview's own words on that screen, which Network Canvas supplies.
  site(stage(FINISH_STAGE_INDEX, 'finishLabel'), 'plain'),
  site(stage(FINISH_STAGE_INDEX, 'finishConfirmation'), 'plain'),
  site(stage(FINISH_STAGE_INDEX, 'finishedNotice'), 'plain'),
  site(stage(FINISH_STAGE_INDEX, 'finishFailed'), 'plain'),
];

/**
 * A message that uses the arguments a site declares: its plural if it has one,
 * else the person's name and whether they are the participant.
 */
const exampleFor = (declaration: MessageArguments | undefined): string => {
  const plural = Object.keys(declaration ?? {}).find(
    (name) => declaration?.[name]?.kind === 'plural',
  );
  return plural === undefined
    ? '{isYou, select, true {You} other {“{name}”}}'
    : `{${plural}, plural, other {# items}}`;
};

const pathKey = (path: readonly PropertyKey[]) =>
  JSON.stringify(path.map((key) => (typeof key === 'symbol' ? '' : key)));

const setAt = (root: object, path: Path, value: unknown): void => {
  let node: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (typeof node !== 'object' || node === null) {
      throw new Error(`No value at ${pathKey(path)}`);
    }
    node = Reflect.get(node, key);
  }
  const last = path.at(-1);
  if (typeof node !== 'object' || node === null || last === undefined) {
    throw new Error(`No value at ${pathKey(path)}`);
  }
  Reflect.set(node, last, value);
};

const withValueAt = (path: Path, value: unknown) => {
  const protocol = completeProtocol();
  setAt(protocol, path, value);
  return protocol;
};

// Every path an issue names, including those inside a union's branches, so a
// field reached through a plain union is matched at its own path.
const issuePaths = (
  issues: readonly z.core.$ZodIssue[],
  prefix: readonly PropertyKey[] = [],
): string[] =>
  issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    const nested =
      issue.code === 'invalid_union'
        ? issue.errors.flatMap((branch) => issuePaths(branch, path))
        : [];
    return [pathKey(path), ...nested];
  });

const failurePaths = (protocol: unknown): string[] => {
  const result = ProtocolSchemaV9.safeParse(withFinishStage(protocol));
  return result.success ? [] : issuePaths(result.error.issues);
};

const siteName = ({ path }: ExpectedSite) => path.join('.');

describe('localized string coverage', () => {
  it('accepts a protocol with copy in every localized field family', () => {
    const result = ProtocolSchemaV9.safeParse(
      withFinishStage(completeProtocol()),
    );
    expect(result.error?.issues).toBeUndefined();
  });

  it('finds exactly the expected localized sites', () => {
    const found = collectLocalizedStrings(completeProtocol())
      .map(({ path, format, arguments: declaration }) => ({
        path: pathKey(path),
        format,
        arguments: declaration,
      }))
      .toSorted((a, b) => a.path.localeCompare(b.path));
    const expected = EXPECTED_SITES.map(
      ({ path, format, arguments: declaration }) => ({
        path: pathKey(path),
        format,
        arguments: declaration,
      }),
    ).toSorted((a, b) => a.path.localeCompare(b.path));
    expect(found).toEqual(expected);
  });

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'rejects plain-string copy at %s',
    (_name, { path }) => {
      expect(failurePaths(withValueAt(path, 'Plain text'))).toContain(
        pathKey(path),
      );
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'keeps the field rule for copy with no translation at %s',
    (_name, { path, allowsNoTranslation }) => {
      const paths = failurePaths(withValueAt(path, {}));
      if (allowsNoTranslation) expect(paths).toEqual([]);
      else expect(paths).toContain(pathKey(path));
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'rejects a translation in a language the protocol does not declare at %s',
    (_name, { path }) => {
      const protocol = withValueAt(path, { en: 'English', fr: 'Français' });
      expect(failurePaths(protocol)).toEqual([pathKey([...path, 'fr'])]);
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'keeps the field rule for an empty translation at %s',
    (_name, { path, allowsEmpty }) => {
      const paths = failurePaths(withValueAt(path, { en: '' }));
      if (allowsEmpty) expect(paths).toEqual([]);
      else expect(paths).toContain(pathKey([...path, 'en']));
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'rejects message placeholders it does not declare at %s',
    (_name, { path }) => {
      expect(
        failurePaths(withValueAt(path, { en: 'Hello {undeclared}' })),
      ).toContain(pathKey([...path, 'en']));
    },
  );

  it.each(
    EXPECTED_SITES.flatMap((expected) =>
      expected.arguments === undefined ? [] : [[siteName(expected), expected]],
    ),
  )(
    'accepts the arguments it declares at %s',
    (_name, { path, arguments: declaration }) => {
      expect(
        failurePaths(
          withValueAt(path, {
            en: exampleFor(declaration),
          }),
        ),
      ).toEqual([]);
    },
  );
});

describe('attribute labels', () => {
  const nameLabel = [...personVariable('name'), 'label'] as const;

  it('are plain text rather than copy', () => {
    expect(failurePaths(withValueAt(nameLabel, 'Full name'))).toEqual([]);
    expect(failurePaths(withValueAt(nameLabel, { en: 'Full name' }))).toContain(
      pathKey(nameLabel),
    );
  });

  it('may not be empty', () => {
    expect(failurePaths(withValueAt(nameLabel, ''))).toContain(
      pathKey(nameLabel),
    );
  });
});

describe('Network Composer scale end labels', () => {
  const field = {
    component: 'VisualAnalogScale',
    parameters: { minLabel: localized('Low'), step: 5 },
  };

  it('keeps parameter keys that carry no copy', () => {
    const protocol = completeProtocol();
    setAt(protocol, stage(7, 'nodeForm', 'fields', 0, 'parameters', 'step'), 5);
    expect(ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success).toBe(
      true,
    );
  });

  // The typed branch is what makes the end labels visible: behind an opaque
  // parameter record the same value carries no metadata to find.
  it('would hide the end labels behind an opaque parameter record', () => {
    const typed = z.object({
      component: z.string(),
      parameters: z.looseObject({
        minLabel: localizedString(z.string(), 'markdown').optional(),
      }),
    });
    const opaque = z.object({
      component: z.string(),
      parameters: z.record(z.string(), z.unknown()),
    });
    expect(
      collectLocalizedStringsFromSchema(typed, field).map(({ path }) => path),
    ).toEqual([['parameters', 'minLabel']]);
    expect(collectLocalizedStringsFromSchema(opaque, field)).toEqual([]);
  });

  it('does not treat end labels on another control as copy', () => {
    const protocol = completeProtocol();
    setAt(protocol, stage(7, 'nodeForm', 'fields', 1, 'parameters'), {
      minLabel: 'not copy',
    });
    expect(ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success).toBe(
      true,
    );
    expect(
      collectLocalizedStrings(protocol).some(
        ({ path }) =>
          pathKey(path) ===
          pathKey(stage(7, 'nodeForm', 'fields', 1, 'parameters', 'minLabel')),
      ),
    ).toBe(false);
  });
});

describe('analyzeProtocolLocalization', () => {
  const bilingual = () => {
    const protocol = completeProtocol();
    protocol.localization = { defaultLocale: 'en', locales: ['en', 'fr'] };
    return protocol;
  };

  const warningsAt = (
    protocol: ReturnType<typeof completeProtocol>,
    path: Path,
  ) =>
    analyzeProtocolLocalization(
      ProtocolSchemaV9.parse(withFinishStage(protocol)),
    ).filter((warning) => pathKey(warning.path) === pathKey(path));

  it('accepts and warns about a missing translation in a declared language', () => {
    const protocol = bilingual();
    expect(ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success).toBe(
      true,
    );
    expect(warningsAt(protocol, stage(0, 'label'))).toEqual([
      {
        code: 'missing-translation',
        path: stage(0, 'label'),
        locale: 'fr',
        isDefaultLocale: false,
        fallbackLocale: 'en',
      },
    ]);
  });

  it('warns about a missing default-language translation', () => {
    const protocol = bilingual();
    setAt(protocol, stage(0, 'label'), { fr: 'Langue' });
    expect(ProtocolSchemaV9.safeParse(withFinishStage(protocol)).success).toBe(
      true,
    );
    expect(warningsAt(protocol, stage(0, 'label'))).toEqual([
      {
        code: 'missing-translation',
        path: stage(0, 'label'),
        locale: 'en',
        isDefaultLocale: true,
        fallbackLocale: 'fr',
      },
    ]);
  });

  // A regional language falls back to its related translation rather than to
  // the default, exactly as the interview resolves it.
  it('reports the fallback the interview resolves for each missing language', () => {
    const protocol = completeProtocol();
    protocol.localization = {
      defaultLocale: 'en',
      locales: ['en', 'es', 'es-MX'],
    };
    const label = { en: 'Language', es: 'Idioma' };
    setAt(protocol, stage(0, 'label'), label);
    const warnings = warningsAt(protocol, stage(0, 'label'));
    expect(warnings).toEqual([
      expect.objectContaining({ locale: 'es-MX', fallbackLocale: 'es' }),
    ]);
    expect(warnings[0]?.fallbackLocale).toBe(
      resolveLocalizedString(label, protocol.localization, ['es-MX']).locale,
    );
  });

  // Without the default language's text, the fallback is the first language
  // by tag that has it, whatever order the languages are declared in.
  it.each([{ locales: ['en', 'fr', 'es'] }, { locales: ['fr', 'es', 'en'] }])(
    'reports a fallback that does not depend on declaration order ($locales)',
    ({ locales }) => {
      const protocol = completeProtocol();
      protocol.localization = { defaultLocale: 'en', locales };
      setAt(protocol, stage(0, 'label'), { es: 'Idioma', fr: 'Langue' });
      expect(warningsAt(protocol, stage(0, 'label'))).toEqual([
        expect.objectContaining({ locale: 'en', fallbackLocale: 'es' }),
      ]);
    },
  );

  it('reports nothing for a fully translated string', () => {
    const protocol = bilingual();
    setAt(protocol, stage(0, 'label'), { en: 'Language', fr: 'Langue' });
    expect(warningsAt(protocol, stage(0, 'label'))).toEqual([]);
  });
});

describe('LanguageChooser stage', () => {
  it('rejects keys the chooser does not define', () => {
    expect(failurePaths(withValueAt(stage(0, 'locales'), ['en']))).toContain(
      pathKey(stage(0)),
    );
  });
});
