import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { analyzeProtocolLocalization } from '../../../localization/analyzeProtocolLocalization.ts';
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
import { completeProtocol } from './complete-localized-protocol.ts';

type Path = readonly (string | number)[];

type ExpectedSite = Readonly<{
  path: Path;
  format: LocalizedStringFormat;
  // Whether the field's own rule allows an empty translation.
  allowsEmpty: boolean;
}>;

const site = (
  path: Path,
  format: LocalizedStringFormat,
  allowsEmpty = false,
): ExpectedSite => ({ path, format, allowsEmpty });

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
  site([...person, 'label'], 'plain', true),
  site(
    [...personVariable('category'), 'options', 0, 'label'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('category'), 'options', 1, 'label'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('strength'), 'options', 0, 'label'],
    'markdown',
    true,
  ),
  site(
    [...personVariable('strength'), 'options', 1, 'label'],
    'markdown',
    true,
  ),
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
  site([...personVariable('flag'), 'options', 0, 'label'], 'markdown', true),
  site([...personVariable('flag'), 'options', 1, 'label'], 'markdown', true),
  site(['codebook', 'node', 'relative', 'label'], 'plain', true),
  site(['codebook', 'edge', 'knows', 'label'], 'plain', true),
  site(
    [...knowsVariable('tieStrength'), 'options', 0, 'label'],
    'markdown',
    true,
  ),
  site(
    [...knowsVariable('tieStrength'), 'options', 1, 'label'],
    'markdown',
    true,
  ),
  site(['codebook', 'edge', 'family', 'label'], 'plain', true),

  // Every stage's label.
  ...Array.from({ length: 20 }, (_, index) =>
    site(stage(index, 'label'), 'plain'),
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
  site(stage(3, 'panels', 0, 'title'), 'plain'),
  site(stage(3, 'prompts', 0, 'text'), 'markdown'),

  site(stage(4, 'prompts', 0, 'text'), 'markdown'),

  site(
    stage(5, 'cardOptions', 'additionalProperties', 0, 'label'),
    'plain',
    true,
  ),
  site(
    stage(5, 'sortOptions', 'sortableProperties', 0, 'label'),
    'plain',
    true,
  ),
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

  site(stage(18, 'nodeConfig', 'form', 0, 'prompt'), 'markdown'),
  site(stage(18, 'nodeConfig', 'form', 0, 'hint'), 'markdown', true),
  site(stage(18, 'introScreen', 'items', 0, 'content'), 'markdown', true),
  site(stage(18, 'introScreen', 'items', 1, 'description'), 'plain', true),
  site(stage(18, 'censusPrompt'), 'markdown'),
  site(stage(18, 'nominationPrompts', 0, 'text'), 'markdown'),

  site(stage(19, 'diseases', 0, 'label'), 'plain'),
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
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success ? [] : issuePaths(result.error.issues);
};

const siteName = ({ path }: ExpectedSite) => path.join('.');

describe('localized string coverage', () => {
  it('accepts a protocol with copy in every localized field family', () => {
    const result = ProtocolSchemaV9.safeParse(completeProtocol());
    expect(result.error?.issues).toBeUndefined();
  });

  it('finds exactly the expected localized sites', () => {
    const found = collectLocalizedStrings(completeProtocol())
      .map(({ path, format }) => ({ path: pathKey(path), format }))
      .toSorted((a, b) => a.path.localeCompare(b.path));
    const expected = EXPECTED_SITES.map(({ path, format }) => ({
      path: pathKey(path),
      format,
    })).toSorted((a, b) => a.path.localeCompare(b.path));
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
    'rejects copy with no translation at %s',
    (_name, { path }) => {
      expect(failurePaths(withValueAt(path, {}))).toContain(pathKey(path));
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
    'rejects message placeholders at %s',
    (_name, { path }) => {
      expect(failurePaths(withValueAt(path, { en: 'Hello {name}' }))).toContain(
        pathKey([...path, 'en']),
      );
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
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
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
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
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
    analyzeProtocolLocalization(ProtocolSchemaV9.parse(protocol)).filter(
      (warning) => pathKey(warning.path) === pathKey(path),
    );

  it('accepts and warns about a missing translation in a declared language', () => {
    const protocol = bilingual();
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
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
    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
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
