import { describe, expect, it } from 'vitest';

import {
  type DynamicValueSiteContext,
  dynamicValueRolesAt,
} from '@codaco/protocol-validation';

import {
  bindingFor,
  dynamicValueChoices,
  dynamicValueNamesUsedIn,
} from '../dynamicValueCatalog';

const EGO = {
  name: { name: 'Name', type: 'text' },
  secret: { name: 'Secret', type: 'text', encrypted: true },
  layout: { name: 'Position', type: 'layout' },
  children: { name: 'Number of children', type: 'number' },
  smokes: { name: 'Smokes', type: 'boolean' },
} as const;

const NODE = {
  name: { name: 'Name', type: 'text' },
  closeness: {
    name: 'Closeness',
    type: 'ordinal',
    options: [
      { value: 1, label: { en: 'Very close' } },
      { value: 'not close', label: { en: 'Not close' } },
    ],
  },
} as const;

const contextFor = (
  stageType: string,
  site: 'stageText' | 'prompt' | 'formField',
  withNode = false,
): DynamicValueSiteContext => ({
  roles: dynamicValueRolesAt(
    stageType,
    site,
    withNode ? { entity: 'node', type: 'person' } : undefined,
  ),
  variablesFor: (role) =>
    role === 'ego'
      ? EGO
      : role === 'node' || role.startsWith('dyad')
        ? NODE
        : undefined,
  notYetWritten: undefined,
});

const labelText = (label: unknown) =>
  typeof label === 'object' && label !== null && 'en' in label
    ? String(label.en)
    : '';

describe('dynamicValueChoices', () => {
  it('offers today’s date and the attributes text can show, and nothing else', () => {
    const paths = dynamicValueChoices(
      contextFor('Information', 'stageText'),
    ).map((choice) => choice.path);
    expect(paths).toEqual(['now', 'ego.name', 'ego.children', 'ego.smokes']);
  });

  it('adds the pair on a dyad prompt', () => {
    const paths = dynamicValueChoices(contextFor('DyadCensus', 'prompt')).map(
      (choice) => choice.path,
    );
    expect(paths).toContain('dyad.source.closeness');
    expect(paths).toContain('dyad.target.name');
  });

  it('gives a yes-or-no attribute without labels its two answers', () => {
    const smokes = dynamicValueChoices(
      contextFor('Information', 'stageText'),
    ).find((choice) => choice.path === 'ego.smokes');
    expect(smokes?.options.map((option) => option.value)).toEqual([
      true,
      false,
    ]);
  });
});

describe('bindingFor', () => {
  const choices = dynamicValueChoices(contextFor('DyadCensus', 'prompt'));
  const choice = (path: string) => {
    const found = choices.find((each) => each.path === path);
    if (found === undefined) throw new Error(path);
    return found;
  };

  it('names a binding for the attribute, prefixed for each person of a pair', () => {
    expect(bindingFor(choice('ego.name'), {}, {}, labelText).name).toBe('name');
    expect(bindingFor(choice('dyad.source.name'), {}, {}, labelText).name).toBe(
      'firstName',
    );
    expect(bindingFor(choice('dyad.target.name'), {}, {}, labelText).name).toBe(
      'secondName',
    );
    expect(bindingFor(choice('now'), {}, {}, labelText).name).toBe('today');
  });

  it('numbers a name the stage already uses for something else', () => {
    expect(
      bindingFor(
        choice('ego.name'),
        { name: { path: 'ego.children' } },
        {},
        labelText,
      ).name,
    ).toBe('name2');
  });

  it('reuses the stage’s binding for the same value', () => {
    expect(
      bindingFor(
        choice('ego.name'),
        { you: { path: 'ego.name' } },
        {},
        labelText,
      ),
    ).toEqual({ name: 'you', binding: { path: 'ego.name' } });
  });

  it('names a case for each answer, from its value or its label', () => {
    expect(
      bindingFor(choice('dyad.source.closeness'), {}, {}, labelText).binding,
    ).toEqual({
      path: 'dyad.source.closeness',
      cases: { veryClose: 1, notClose: 'not close' },
    });
    expect(bindingFor(choice('ego.smokes'), {}, {}, labelText).binding).toEqual(
      {
        path: 'ego.smokes',
        cases: { yes: true, no: false },
      },
    );
  });
});

describe('dynamicValueNamesUsedIn', () => {
  it('finds the names every text in a stage uses', () => {
    expect(
      [
        ...dynamicValueNamesUsedIn({
          title: { en: 'Hi {name, select, missing {there} other {{name}}}' },
          prompts: [{ text: { en: 'Since {today}', fr: "Depuis '{today}'" } }],
          label: 'Literal {braces} in a label',
        }),
      ].sort(),
    ).toEqual(['braces', 'name', 'today']);
  });
});
