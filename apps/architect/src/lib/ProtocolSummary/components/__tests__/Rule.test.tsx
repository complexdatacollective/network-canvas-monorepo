import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import {
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import type { Codebook, CurrentProtocol } from '@codaco/protocol-validation';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import Rule from '../Rule';
import SummaryContext from '../SummaryContext';

afterEach(cleanup);

const PERSON = testTypeId('person');
const FRIEND = testTypeId('friend');
const GONE = testTypeId('gone');
const AGE = testVariableId('age');
const GROUPS = testVariableId('groups');
const SINCE = testVariableId('since');
const EGO_NAME = testVariableId('egoName');
const EGO_AGE = testVariableId('egoAge');
const HOME = testVariableId('home');

const codebook = {
  node: {
    [PERSON]: {
      name: 'Person',
      color: 'node-color-seq-1',
      iconVariant: 'add-a-person',
      shape: { default: 'circle' },
      variables: {
        [AGE]: { name: 'Age', type: 'number' },
        [GROUPS]: {
          name: 'Groups',
          type: 'categorical',
          options: [
            { value: 'a', label: { en: 'Alpha', fr: 'Alpha (fr)' } },
            { value: 'b', label: { en: 'Bravo' } },
          ],
        },
      },
    },
  },
  edge: {
    [FRIEND]: {
      name: 'Friend',
      color: 'edge-color-seq-1',
      variables: { [SINCE]: { name: 'Since', type: 'datetime' } },
    },
  },
  ego: {
    variables: {
      [EGO_NAME]: { name: 'EgoName', type: 'text' },
      [EGO_AGE]: { name: 'EgoAge', type: 'number' },
    },
  },
  layouts: { [HOME]: { name: 'Home' } },
  // The fixture is written as a codebook and read as one; nothing here is
  // narrowed from a wider type, so the cast is the shape's own declaration.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
} as unknown as Codebook;

/**
 * The sentence as it is read, rather than as `textContent` concatenates it.
 *
 * A summary rule is laid out in three columns, so the words that separate them
 * are the gaps between grid cells and not text nodes; and the entity glyph is
 * `aria-hidden`, so its icon's alt text is on screen for nobody. Both are
 * properties of the layout, and neither belongs in the sentence.
 */
const readableText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  if (node.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(node.childNodes).map(readableText).join(' ');
};

const sentence = (rule: unknown) => {
  const { container } = render(
    <ArchitectI18nProvider>
      <Rule rule={rule} codebook={codebook} />
    </ArchitectI18nProvider>,
  );
  return readableText(container).replace(/\s+/g, ' ').trim();
};

/*
 * One rule of every shape the printable summary can be asked to render, read
 * back as the sentence a researcher sees. These are the package's sentences,
 * because the package is where a rule's meaning is decided — Architect used to
 * decide it a second time, and the two answers had already parted company on
 * the first case below.
 */
it.each([
  // The ego's own attribute, asked about only for whether it was answered.
  // Architect's deleted copy said "Ego where EgoName", which reads as a
  // clause with nothing after it; the builder's rule list has always said
  // "has", and the summary now says what the list says.
  [
    'ego attribute presence',
    { type: 'ego', options: { attribute: EGO_NAME, operator: 'EXISTS' } },
    'Ego has EgoName',
  ],
  [
    'ego attribute absence',
    { type: 'ego', options: { attribute: EGO_NAME, operator: 'NOT_EXISTS' } },
    'Ego without EgoName',
  ],
  [
    'ego attribute comparison',
    {
      type: 'ego',
      options: { attribute: EGO_AGE, operator: 'GREATER_THAN', value: 30 },
    },
    'Ego has EgoAge that is greater than 30',
  ],
  [
    'node type presence',
    { type: 'node', options: { type: PERSON, operator: 'EXISTS' } },
    'Person exists',
  ],
  [
    'node type absence',
    { type: 'node', options: { type: PERSON, operator: 'NOT_EXISTS' } },
    'Person does not exist',
  ],
  [
    'node attribute presence',
    {
      type: 'node',
      options: { type: PERSON, attribute: AGE, operator: 'EXISTS' },
    },
    'Person where Age',
  ],
  [
    'node attribute absence',
    {
      type: 'node',
      options: { type: PERSON, attribute: AGE, operator: 'NOT_EXISTS' },
    },
    'Person without Age',
  ],
  [
    'node attribute comparison',
    {
      type: 'node',
      options: {
        type: PERSON,
        attribute: AGE,
        operator: 'GREATER_THAN',
        value: 30,
      },
    },
    'Person where Age is greater than 30',
  ],
  [
    'node option list',
    {
      type: 'node',
      options: {
        type: PERSON,
        attribute: GROUPS,
        operator: 'INCLUDES',
        value: ['a', 'b'],
      },
    },
    'Person where Groups includes Alpha and Bravo',
  ],
  [
    'node option count',
    {
      type: 'node',
      options: {
        type: PERSON,
        attribute: GROUPS,
        operator: 'OPTIONS_EQUALS',
        value: 2,
      },
    },
    'Person where Groups has selected options equal to 2',
  ],
  [
    'edge type presence',
    { type: 'edge', options: { type: FRIEND, operator: 'EXISTS' } },
    'Friend exists',
  ],
  [
    'edge attribute comparison',
    {
      type: 'edge',
      options: {
        type: FRIEND,
        attribute: SINCE,
        operator: 'LESS_THAN',
        value: '2020-01-01',
      },
    },
    'Friend where Since is less than 2020-01-01',
  ],
])('prints a %s rule as the builder reads it', (_shape, rule, expected) => {
  expect(sentence(rule)).toBe(expected);
});

// A layout belongs to the codebook rather than to the node type, so the rule
// is read by the layout's name, as the builder's rule list reads it.
it('prints a rule naming a layout by the layout’s name', () => {
  expect(
    sentence({
      type: 'node',
      options: { type: PERSON, attribute: HOME, operator: 'EXISTS' },
    }),
  ).toBe('Person where Home');
});

it('names an entity type the codebook no longer has rather than printing nothing', () => {
  expect(
    sentence({
      type: 'node',
      options: {
        type: GONE,
        attribute: AGE,
        operator: 'EXACTLY',
        value: '1',
      },
    }),
  ).toBe(`${GONE} where ${AGE} is exactly equal to 1`);
});

// A rule is one sentence, so it names each option once: in the protocol's
// default language, as the stage it filters is named in the summary.
it('reads option labels in the default language, falling back as the interview does', () => {
  const protocol: CurrentProtocol = {
    name: 'Study',
    schemaVersion: 9,
    localization: { defaultLocale: 'fr', locales: ['en', 'fr'] },
    assetManifest: {},
    codebook,
    stages: [],
  };
  const { container } = render(
    <ArchitectI18nProvider>
      <SummaryContext.Provider
        value={{ protocol, protocolName: 'Study', index: [] }}
      >
        <Rule
          rule={{
            type: 'node',
            options: {
              type: PERSON,
              attribute: GROUPS,
              operator: 'INCLUDES',
              value: ['a', 'b'],
            },
          }}
          codebook={codebook}
        />
      </SummaryContext.Provider>
    </ArchitectI18nProvider>,
  );

  expect(readableText(container).replace(/\s+/g, ' ').trim()).toBe(
    'Person where Groups includes Alpha (fr) and Bravo',
  );
});
