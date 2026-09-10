import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import Rule from '../Rule';

afterEach(cleanup);

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      iconVariant: 'add-a-person',
      shape: { default: 'circle' },
      variables: {
        age: { name: 'Age', type: 'number' },
        groups: {
          name: 'Groups',
          type: 'categorical',
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Bravo' },
          ],
        },
      },
    },
  },
  edge: {
    friend: {
      name: 'Friend',
      color: 'edge-color-seq-1',
      variables: { since: { name: 'Since', type: 'datetime' } },
    },
  },
  ego: {
    variables: {
      egoName: { name: 'EgoName', type: 'text' },
      egoAge: { name: 'EgoAge', type: 'number' },
    },
  },
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
    { type: 'ego', options: { attribute: 'egoName', operator: 'EXISTS' } },
    'Ego has EgoName',
  ],
  [
    'ego attribute absence',
    { type: 'ego', options: { attribute: 'egoName', operator: 'NOT_EXISTS' } },
    'Ego without EgoName',
  ],
  [
    'ego attribute comparison',
    {
      type: 'ego',
      options: { attribute: 'egoAge', operator: 'GREATER_THAN', value: 30 },
    },
    'Ego has EgoAge that is greater than 30',
  ],
  [
    'node type presence',
    { type: 'node', options: { type: 'person', operator: 'EXISTS' } },
    'Person exists',
  ],
  [
    'node type absence',
    { type: 'node', options: { type: 'person', operator: 'NOT_EXISTS' } },
    'Person does not exist',
  ],
  [
    'node attribute presence',
    {
      type: 'node',
      options: { type: 'person', attribute: 'age', operator: 'EXISTS' },
    },
    'Person where Age',
  ],
  [
    'node attribute absence',
    {
      type: 'node',
      options: { type: 'person', attribute: 'age', operator: 'NOT_EXISTS' },
    },
    'Person without Age',
  ],
  [
    'node attribute comparison',
    {
      type: 'node',
      options: {
        type: 'person',
        attribute: 'age',
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
        type: 'person',
        attribute: 'groups',
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
        type: 'person',
        attribute: 'groups',
        operator: 'OPTIONS_EQUALS',
        value: 2,
      },
    },
    'Person where Groups has selected options equal to 2',
  ],
  [
    'edge type presence',
    { type: 'edge', options: { type: 'friend', operator: 'EXISTS' } },
    'Friend exists',
  ],
  [
    'edge attribute comparison',
    {
      type: 'edge',
      options: {
        type: 'friend',
        attribute: 'since',
        operator: 'LESS_THAN',
        value: '2020-01-01',
      },
    },
    'Friend where Since is less than 2020-01-01',
  ],
])('prints a %s rule as the builder reads it', (_shape, rule, expected) => {
  expect(sentence(rule)).toBe(expected);
});

it('names an entity type the codebook no longer has rather than printing nothing', () => {
  expect(
    sentence({
      type: 'node',
      options: {
        type: 'gone',
        attribute: 'age',
        operator: 'EXACTLY',
        value: '1',
      },
    }),
  ).toBe('gone where age is exactly equal to 1');
});
