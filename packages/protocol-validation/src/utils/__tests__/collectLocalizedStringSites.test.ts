import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { localizedString } from '../../schemas/9/localized-string.ts';
import {
  collectLocalizedStringSites,
  collectLocalizedStringsFromSchema,
} from '../collectLocalizedStrings.ts';

const title = localizedString(z.string().min(1), 'plain');
const hint = localizedString(z.string(), 'markdown');
const minLabel = localizedString(z.string(), 'plain');

const schema = z.object({
  title,
  hint: hint.optional(),
  items: z.array(z.object({ hint: hint.optional() })),
  parameters: z.looseObject({ minLabel: minLabel.optional() }),
});

const sitesOf = (value: unknown) => collectLocalizedStringSites(schema, value);

describe('collectLocalizedStringSites', () => {
  it('reports each site and whether its field may be left out', () => {
    const sites = sitesOf({
      title: 'Welcome',
      hint: { en: 'More' },
      items: [{ hint: 'First' }],
      parameters: { minLabel: 'Low' },
    });

    expect(
      sites.map(({ path, value, format, optional, looseContainer }) => ({
        path,
        value,
        format,
        optional,
        looseContainer,
      })),
    ).toEqual([
      {
        path: ['title'],
        value: 'Welcome',
        format: 'plain',
        optional: false,
        looseContainer: false,
      },
      {
        path: ['hint'],
        value: { en: 'More' },
        format: 'markdown',
        optional: true,
        looseContainer: false,
      },
      {
        path: ['items', 0, 'hint'],
        value: 'First',
        format: 'markdown',
        optional: true,
        looseContainer: false,
      },
      {
        path: ['parameters', 'minLabel'],
        value: 'Low',
        format: 'plain',
        optional: true,
        looseContainer: true,
      },
    ]);
  });

  it('names the declaration each site belongs to', () => {
    const declarations = sitesOf({
      title: 'Welcome',
      hint: 'More',
      items: [{ hint: 'First' }],
      parameters: { minLabel: 'Low' },
    }).map((site) => site.schema);

    expect(declarations).toHaveLength(4);
    expect(declarations[0]).toBe(title);
    expect(declarations[1]).toBe(hint);
    expect(declarations[2]).toBe(hint);
    expect(declarations[3]).toBe(minLabel);
  });

  it('reports a value of any type at a site', () => {
    const sites = sitesOf({
      title: 5,
      items: [],
      parameters: { minLabel: null },
    });

    expect(sites.map(({ path, value }) => ({ path, value }))).toEqual([
      { path: ['title'], value: 5 },
      { path: ['parameters', 'minLabel'], value: null },
    ]);
  });

  it('does not report a site whose value is absent', () => {
    expect(sitesOf({ items: [{}], parameters: {} })).toEqual([]);
  });

  it('leaves values that are not localized out of the localized string hits', () => {
    const value = {
      title: 'Welcome',
      hint: { en: 'More' },
      items: [],
      parameters: {},
    };

    expect(
      collectLocalizedStringsFromSchema(schema, value).map(({ path }) => path),
    ).toEqual([['hint']]);
  });
});
