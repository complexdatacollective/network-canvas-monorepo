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
import { builtInWordingPaths } from '../built-in-wording.ts';
import { PEDIGREE_RELATIONSHIP_KINDS } from '../family-pedigree-values.ts';
import {
  type LocalizedStringFormat,
  type LocalizedTextLines,
  type LocalizedTextShape,
  localizedString,
} from '../localized-string.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { familyPedigreeWordingIn } from '../stage-wording/family-pedigree.ts';
import { SUBJECT_ARGUMENTS } from '../stage-wording/subject.ts';
import {
  PEDIGREE_PERSON_ARGUMENTS,
  PEDIGREE_WORDING_ARGUMENTS,
} from '../stages/family-pedigree.ts';
import { UNNAMED_LABEL_ARGUMENTS } from '../stages/name-generator-roster.ts';
import {
  MAX_NODES_ARGUMENTS,
  MIN_NODES_ARGUMENTS,
} from '../stages/name-generator.ts';
import {
  SNAPSHOT_CONDITION_ARGUMENTS,
  SNAPSHOT_INHERITANCE_ARGUMENTS,
} from '../stages/narrative-pedigree.ts';
import { completeProtocol } from './complete-localized-protocol.ts';

type Path = readonly (string | number)[];

const PLAIN_LINE: LocalizedTextShape = { format: 'plain', lines: 'single' };
const MARKDOWN_LINE: LocalizedTextShape = {
  format: 'markdown',
  lines: 'single',
};
const MARKDOWN_BLOCKS: LocalizedTextShape = {
  format: 'markdown',
  lines: 'multiple',
};

type ExpectedSite = Readonly<{
  path: Path;
  format: LocalizedStringFormat;
  lines: LocalizedTextLines;
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
  { format, lines }: LocalizedTextShape,
  allowsEmpty = false,
  allowsNoTranslation = false,
): ExpectedSite => ({ path, format, lines, allowsEmpty, allowsNoTranslation });

const messageSite = (
  path: Path,
  declaration: MessageArguments,
): ExpectedSite => ({
  ...site(path, PLAIN_LINE),
  arguments: declaration,
});

/**
 * A message that uses each argument a declaration holds, as its kind says:
 * the text shows it, a select chooses by its first case, and a plural by
 * number.
 */
const messageUsing = (declaration: MessageArguments): string =>
  Object.entries(declaration)
    .map(([name, argument]) => {
      if (argument.kind === 'text') return `{${name}}`;
      if (argument.kind === 'plural')
        return `{${name}, plural, one {# x} other {# y}}`;
      const [first = 'other'] = argument.cases;
      return `{${name}, select, ${first} {x} other {y}}`;
    })
    .join(' ');

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
  // Codebook variable option copy.
  site([...personVariable('category'), 'options', 0, 'label'], MARKDOWN_LINE),
  site([...personVariable('category'), 'options', 1, 'label'], MARKDOWN_LINE),
  site([...personVariable('strength'), 'options', 0, 'label'], MARKDOWN_LINE),
  site([...personVariable('strength'), 'options', 1, 'label'], MARKDOWN_LINE),
  site(
    [...personVariable('closeness'), 'parameters', 'minLabel'],
    MARKDOWN_LINE,
  ),
  site(
    [...personVariable('closeness'), 'parameters', 'maxLabel'],
    MARKDOWN_LINE,
  ),
  site([...personVariable('flag'), 'options', 0, 'label'], MARKDOWN_LINE),
  site([...personVariable('flag'), 'options', 1, 'label'], MARKDOWN_LINE),
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
      MARKDOWN_LINE,
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
      MARKDOWN_LINE,
    ),
  ),
  site([...knowsVariable('tieStrength'), 'options', 0, 'label'], MARKDOWN_LINE),
  site([...knowsVariable('tieStrength'), 'options', 1, 'label'], MARKDOWN_LINE),
  ...Array.from({ length: PEDIGREE_RELATIONSHIP_KINDS.length }, (_, index) =>
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
      MARKDOWN_LINE,
    ),
  ),

  // Every stage's label.
  ...Array.from({ length: 21 }, (_, index) =>
    site(
      stage(index, 'label'),
      PLAIN_LINE,
      false,
      index === FINISH_STAGE_INDEX,
    ),
  ),

  // The Language Chooser's heading, which Network Canvas supplies.
  site(stage(0, 'title'), PLAIN_LINE),

  site(stage(1, 'title'), PLAIN_LINE),
  site(stage(1, 'items', 0, 'content'), MARKDOWN_BLOCKS),
  site(stage(1, 'items', 1, 'description'), PLAIN_LINE),

  site(stage(2, 'introductionPanel', 'title'), PLAIN_LINE),
  site(stage(2, 'introductionPanel', 'text'), MARKDOWN_BLOCKS),
  site(stage(2, 'form', 'fields', 0, 'prompt'), MARKDOWN_LINE),
  site(stage(2, 'form', 'fields', 0, 'hint'), MARKDOWN_LINE),

  site(stage(3, 'form', 'title'), PLAIN_LINE),
  site(stage(3, 'form', 'fields', 0, 'prompt'), MARKDOWN_LINE),
  messageSite(stage(3, 'minNodesNotice'), MIN_NODES_ARGUMENTS),
  messageSite(stage(3, 'maxNodesNotice'), MAX_NODES_ARGUMENTS),
  site(stage(3, 'panels', 0, 'title'), PLAIN_LINE),
  site(stage(3, 'panels', 1, 'title'), PLAIN_LINE),
  site(stage(3, 'prompts', 0, 'text'), MARKDOWN_LINE),

  messageSite(stage(4, 'addNamePlaceholder'), SUBJECT_ARGUMENTS),
  site(stage(4, 'prompts', 0, 'text'), MARKDOWN_LINE),

  site(stage(5, 'panelTitle'), PLAIN_LINE),
  messageSite(stage(5, 'minNodesNotice'), MIN_NODES_ARGUMENTS),
  messageSite(stage(5, 'maxNodesNotice'), MAX_NODES_ARGUMENTS),
  messageSite(stage(5, 'allAddedNotice'), SUBJECT_ARGUMENTS),
  site(stage(5, 'cardOptions', 'additionalProperties', 0, 'label'), PLAIN_LINE),
  site(stage(5, 'sortOptions', 'sortableProperties', 0, 'label'), PLAIN_LINE),
  messageSite(stage(5, 'unnamedLabel'), UNNAMED_LABEL_ARGUMENTS),
  site(stage(5, 'prompts', 0, 'text'), MARKDOWN_LINE),

  site(stage(6, 'prompts', 0, 'text'), MARKDOWN_LINE),

  // The composer's own scale end labels are separate sites from the codebook
  // scalar's, and override them.
  site(stage(7, 'nodeForm', 'fields', 0, 'label'), MARKDOWN_LINE),
  site(stage(7, 'nodeForm', 'fields', 0, 'hint'), MARKDOWN_LINE),
  site(
    stage(7, 'nodeForm', 'fields', 0, 'parameters', 'minLabel'),
    MARKDOWN_LINE,
  ),
  site(
    stage(7, 'nodeForm', 'fields', 0, 'parameters', 'maxLabel'),
    MARKDOWN_LINE,
  ),
  site(stage(7, 'nodeForm', 'fields', 1, 'label'), MARKDOWN_LINE),
  site(stage(7, 'edges', 0, 'label'), PLAIN_LINE),
  site(stage(7, 'edges', 0, 'form', 'fields', 0, 'label'), MARKDOWN_LINE),

  site(stage(8, 'form', 'fields', 0, 'prompt'), MARKDOWN_LINE),

  site(stage(9, 'form', 'fields', 0, 'prompt'), MARKDOWN_LINE),

  site(stage(10, 'prompts', 0, 'text'), MARKDOWN_LINE),

  site(stage(11, 'prompts', 0, 'text'), MARKDOWN_LINE),
  site(stage(11, 'prompts', 0, 'negativeLabel'), MARKDOWN_LINE),

  site(stage(12, 'prompts', 0, 'text'), MARKDOWN_LINE),
  messageSite(stage(12, 'unplacedNodesNotice'), SUBJECT_ARGUMENTS),

  site(stage(13, 'prompts', 0, 'text'), MARKDOWN_LINE),
  site(stage(13, 'prompts', 0, 'otherVariablePrompt'), MARKDOWN_LINE),
  site(stage(13, 'prompts', 0, 'otherOptionLabel'), MARKDOWN_LINE),

  site(stage(14, 'presets', 0, 'label'), PLAIN_LINE),
  site(stage(14, 'presets', 0, 'highlight', 0, 'label'), PLAIN_LINE),
  site(stage(14, 'presets', 0, 'edges', 'display', 0, 'label'), PLAIN_LINE),
  site(stage(14, 'attributesHeading'), PLAIN_LINE),
  site(stage(14, 'linksHeading'), PLAIN_LINE),
  site(stage(14, 'groupsHeading'), PLAIN_LINE),

  site(stage(15, 'explanationText'), MARKDOWN_BLOCKS),

  site(stage(16, 'prompts', 0, 'text'), MARKDOWN_LINE),

  site(stage(17, 'prompts', 0, 'text'), MARKDOWN_LINE),
  site(stage(17, 'outsideAreasLabel'), PLAIN_LINE),

  site(stage(18, 'prompt'), MARKDOWN_LINE),
  // The Family Pedigree's own wording, which Network Canvas supplies.
  site(stage(18, 'nodeConfiguration', 'nameField', 'prompt'), PLAIN_LINE),
  site(stage(18, 'nodeConfiguration', 'nameField', 'hint'), MARKDOWN_LINE),
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
      PEDIGREE_PERSON_ARGUMENTS,
    ),
  ),
  site(stage(18, 'completeness', 'recommendedNote'), PLAIN_LINE),
  // The stage's own words, which Network Canvas supplies: each has the
  // arguments its message declares (see `PEDIGREE_WORDING_ARGUMENTS`).
  ...Object.keys(familyPedigreeWordingIn()).map((key) => {
    const declaration: Readonly<Record<string, MessageArguments | undefined>> =
      PEDIGREE_WORDING_ARGUMENTS;
    const argumentsOf = declaration[key];
    return argumentsOf === undefined
      ? site(stage(18, 'wording', key), PLAIN_LINE)
      : messageSite(stage(18, 'wording', key), argumentsOf);
  }),
  site(stage(18, 'form', 'fields', 0, 'prompt'), MARKDOWN_LINE),
  site(stage(18, 'form', 'fields', 0, 'hint'), MARKDOWN_LINE),
  site(stage(18, 'nominationPrompts', 0, 'text'), MARKDOWN_LINE),

  site(stage(19, 'diseases', 0, 'label'), PLAIN_LINE),
  // The Narrative Pedigree's own words, which Network Canvas supplies.
  site(stage(19, 'saveSnapshot'), PLAIN_LINE),
  site(stage(19, 'conditionText', 'selectCondition'), PLAIN_LINE),
  messageSite(
    stage(19, 'conditionText', 'snapshotCondition'),
    SNAPSHOT_CONDITION_ARGUMENTS,
  ),
  messageSite(
    stage(19, 'conditionText', 'snapshotInheritance'),
    SNAPSHOT_INHERITANCE_ARGUMENTS,
  ),

  // The finish stage's closing and finished text are markdown, so a
  // researcher can write each screen's heading and emphasise a word.
  site(stage(FINISH_STAGE_INDEX, 'content'), MARKDOWN_BLOCKS, false, true),
  site(
    stage(FINISH_STAGE_INDEX, 'finishedContent'),
    MARKDOWN_BLOCKS,
    false,
    true,
  ),
  // The interview's own words on that screen, which Network Canvas supplies.
  site(stage(FINISH_STAGE_INDEX, 'finishLabel'), PLAIN_LINE),
  site(stage(FINISH_STAGE_INDEX, 'finishConfirmation'), PLAIN_LINE),
  site(stage(FINISH_STAGE_INDEX, 'finishFailed'), PLAIN_LINE),
];

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
    // The interface text the protocol holds is Network Canvas's, by group,
    // and covered in `interface-text.test.ts`; these are the field families
    // a protocol's own copy is written in.
    const found = collectLocalizedStrings(completeProtocol())
      .filter(({ path }) => path[0] !== 'interfaceText')
      .map(({ path, format, lines, arguments: declaration }) => ({
        path: pathKey(path),
        format,
        lines,
        arguments: declaration,
      }))
      .toSorted((a, b) => a.path.localeCompare(b.path));
    const expected = EXPECTED_SITES.map(
      ({ path, format, lines, arguments: declaration }) => ({
        path: pathKey(path),
        format,
        lines,
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

  // Wording Network Canvas supplies is written only in a language it has it
  // in exactly, so a protocol in any other may hold it with no translation
  // until the researcher writes it; `validateProtocol` stops such a protocol
  // leaving its editor (`findBuiltInWordingProblems`).
  const builtIn = builtInWordingPaths(withFinishStage(completeProtocol()));

  it('finds supplied wording among the localized sites', () => {
    expect(builtIn.size).toBeGreaterThan(0);
    expect(builtIn.has(JSON.stringify(['stages', 0, 'title']))).toBe(true);
  });

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'keeps the field rule for copy with no translation at %s',
    (_name, { path, allowsNoTranslation }) => {
      const paths = failurePaths(withValueAt(path, {}));
      if (allowsNoTranslation || builtIn.has(JSON.stringify(path)))
        expect(paths).toEqual([]);
      else expect(paths).toContain(pathKey(path));
    },
  );

  it.each(EXPECTED_SITES.map((expected) => [siteName(expected), expected]))(
    'rejects a translation in a language the protocol does not declare at %s',
    (_name, { path, arguments: declaration }) => {
      // A message shows what it must (see `findMissingPlacement`).
      const text = (words: string) =>
        declaration === undefined
          ? words
          : `${words} ${messageUsing(declaration)}`;
      const protocol = withValueAt(path, {
        en: text('English'),
        fr: text('Français'),
      });
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
  )('accepts the arguments it declares at %s', (_name, expected) => {
    expect(
      failurePaths(
        withValueAt(expected.path, {
          en: messageUsing(expected.arguments ?? {}),
        }),
      ),
    ).toEqual([]);
  });
});

/**
 * Every node of `schema` that carries the localized-string tag, found by
 * walking the schema itself rather than a protocol, so a declaration no test
 * protocol holds a value for is still found.
 */
const taggedDeclarations = (schema: z.ZodType): unknown[] => {
  const seen = new Set<z.ZodType>();
  const found: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!(value instanceof z.ZodType) || seen.has(value)) return;
    seen.add(value);
    const tag: unknown = value.meta()?.localizedString;
    if (tag !== undefined) found.push(tag);
    if (value instanceof z.ZodObject) Object.values(value.shape).forEach(visit);
    if (value instanceof z.ZodLazy) visit(value.def.getter());
    Object.values(value.def).forEach(visit);
  };
  visit(schema);
  return found;
};

describe('declared text shapes', () => {
  const declarations = taggedDeclarations(ProtocolSchemaV9);

  it('finds the localized declarations of the whole protocol', () => {
    // Interface text alone declares well over a hundred.
    expect(declarations.length).toBeGreaterThan(200);
  });

  // An editor takes its toolbar and its line handling from the declaration,
  // so a field declared without them could not be edited consistently.
  it('declares plain or markdown, and one line or several, for every field', () => {
    for (const declaration of declarations) {
      expect(declaration).toMatchObject({
        format: expect.stringMatching(/^(plain|markdown)$/),
        lines: expect.stringMatching(/^(single|multiple)$/),
      });
    }
  });

  // No editor edits plain text over several lines.
  it('declares every plain field one line', () => {
    expect(
      declarations.filter(
        (declaration) =>
          typeof declaration === 'object' &&
          declaration !== null &&
          Reflect.get(declaration, 'format') === 'plain' &&
          Reflect.get(declaration, 'lines') !== 'single',
      ),
    ).toEqual([]);
  });
});

describe('codebook labels', () => {
  // Participants never read a type's or an attribute's name, so neither has a
  // label beside it.
  it.each([[[...person, 'label']], [[...personVariable('name'), 'label']]])(
    'refuses a label at %j',
    (path) => {
      expect(failurePaths(withValueAt(path, 'Full name'))).toContain(
        pathKey(path.slice(0, -1)),
      );
    },
  );
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
        minLabel: localizedString(z.string(), {
          format: 'markdown',
          lines: 'single',
        }).optional(),
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
