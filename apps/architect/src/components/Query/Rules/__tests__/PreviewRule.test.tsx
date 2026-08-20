import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PreviewRule from '../PreviewRule';
import PreviewText, { type PreviewTextOptions } from '../PreviewText';

const ALTER_RULE = {
  type: 'node',
  options: {
    typeLabel: 'person',
    typeColor: 'node-color-seq-1',
    attribute: 'name',
    variableType: 'text',
    operator: 'EXACTLY',
    value: 'Dee',
  },
} as const satisfies { type: string; options: PreviewTextOptions };

const TYPE_RULE = {
  type: 'node',
  options: {
    typeLabel: 'person',
    typeColor: 'node-color-seq-1',
    operator: 'EXISTS',
  },
} as const satisfies { type: string; options: PreviewTextOptions };

const EDGE_RULE = {
  type: 'edge',
  options: {
    typeLabel: 'friend',
    typeColor: 'edge-color-seq-1',
    attribute: 'closeness',
    variableType: 'ordinal',
    operator: 'EXACTLY',
    value: 3,
  },
} as const satisfies { type: string; options: PreviewTextOptions };

const EGO_RULE = {
  type: 'ego',
  options: {
    attribute: 'name',
    variableType: 'text',
    operator: 'EXACTLY',
    value: 'Bob',
  },
} as const satisfies { type: string; options: PreviewTextOptions };

const renderRule = (rule: { type: string; options: PreviewTextOptions }) =>
  render(
    <PreviewRule id="rule-text" type={rule.type} options={rule.options} />,
  );

describe('PreviewRule', () => {
  it.each([
    ['a node rule', ALTER_RULE, 'Dee'],
    ['an edge rule', EDGE_RULE, '3'],
    ['an ego rule', EGO_RULE, 'Bob'],
  ])('renders %s as non-interactive preview content', (_name, rule, value) => {
    const { container } = renderRule(rule);

    expect(container.querySelector('#rule-text')).toHaveTextContent(value);
    expect(
      container.querySelectorAll(
        'button, a, input, select, textarea, [tabindex]',
      ),
    ).toHaveLength(0);
  });

  it('renders the complete rule sentence', () => {
    const { container } = renderRule(ALTER_RULE);
    const preview = container.querySelector('#rule-text');

    expect(preview).toHaveTextContent('person');
    expect(preview).toHaveTextContent('where');
    expect(preview).toHaveTextContent('name');
    expect(preview).toHaveTextContent('is exactly equal to');
    expect(preview).toHaveTextContent('Dee');
  });

  it('outlines the operand the researcher supplied', () => {
    const { container } = renderRule(ALTER_RULE);
    const value = container.querySelector('[data-rule-part="value"]');

    // The operand's dashed outline IS the behaviour here: it is what tells a
    // reader which part of the sentence the researcher supplied.
    expect(value).toHaveClass('border-sea-green', 'border-dashed');
  });

  /**
   * A `contains` operand is explicitly a regular expression (see the
   * hint on the rule editor's Value field), and the interview runtime compares
   * every non-multi-select operand verbatim. Rendered as Markdown, the
   * characters that make it a regex are the emphasis delimiters — so the
   * builder and the archived protocol summary both stated a rule the protocol
   * does not hold, with nothing on screen to say so.
   */
  it.each([
    ['a quantified regular expression', '.*abc.*'],
    ['underscores around a captured id', '^_id_[0-9]+$'],
    ['a Windows path', String.raw`C:\path\to\_file_`],
    ['a starred value', 'a*b*c'],
  ])('reads back %s exactly as it is stored', (_name, stored) => {
    const { container } = renderRule({
      ...ALTER_RULE,
      options: { ...ALTER_RULE.options, operator: 'CONTAINS', value: stored },
    });

    expect(
      container.querySelector('[data-rule-part="value"]'),
    ).toHaveTextContent(stored, { normalizeWhitespace: false });
  });

  /**
   * The one operand that is NOT the stored string: `getRuleDisplayOptions`
   * swaps in the option label the researcher authored, and those labels are
   * Markdown wherever else they are shown.
   */
  it('renders each item in a multi-value operand separately', () => {
    const { container } = renderRule({
      ...EGO_RULE,
      options: {
        ...EGO_RULE.options,
        variableType: 'categorical',
        operator: 'INCLUDES',
        value: ['Family', '**No. I decline to** participate'],
      },
    });
    const preview = container.querySelector('#rule-text');
    const values = preview?.querySelectorAll('[data-rule-part="value"]');

    expect(values).toHaveLength(2);
    expect(values?.[0]).toHaveTextContent('Family');
    expect(values?.[1]).toHaveTextContent('No. I decline to participate');
    expect(
      within(values?.[1] as HTMLElement).getByText('No. I decline to'),
    ).toBeVisible();
    expect(preview).toHaveTextContent(
      'that includes Family, No. I decline to participate',
    );
  });

  it('reads as one inline sentence that wraps naturally', () => {
    const { container } = renderRule(ALTER_RULE);
    const preview = container.querySelector('#rule-text');
    const subject = preview?.querySelector('[data-rule-part="subject"]');
    const predicate = preview?.querySelector('[data-rule-part="predicate"]');

    expect(preview).toHaveClass('block', 'text-wrap');
    expect(subject).toHaveClass('inline');
    expect(predicate).toHaveClass('inline');
    expect(subject).toHaveTextContent(/person.*where.*name/);
    expect(predicate).toHaveTextContent(/is exactly equal to.*Dee/);
  });

  it.each([
    ['node', ALTER_RULE, 'person'],
    ['edge', EDGE_RULE, 'friend'],
  ])(
    'renders the %s type as a decorative glyph beside a bold label',
    (type, rule, label) => {
      const { container } = renderRule(rule);
      const entity = container.querySelector(`[data-rule-entity="${type}"]`);
      const glyph = entity?.querySelector(`[data-rule-entity-glyph="${type}"]`);

      expect(entity).toBeInTheDocument();
      // The glyph repeats the label, so it must not repeat it to a reader.
      expect(glyph).toHaveAttribute('aria-hidden');
      expect(glyph).not.toHaveTextContent(label);
      expect(within(entity as HTMLElement).getByText(label)).toHaveClass(
        'font-bold',
      );
    },
  );

  it.each([
    ['exists', TYPE_RULE],
    [
      'does not exist',
      {
        ...TYPE_RULE,
        options: { ...TYPE_RULE.options, operator: 'NOT_EXISTS' },
      },
    ],
  ])('keeps a presence rule with “%s” on one row', (label, rule) => {
    const { container } = renderRule(rule);
    const preview = container.querySelector('#rule-text');
    const subject = preview?.querySelector('[data-rule-part="subject"]');

    expect(subject).toHaveClass('whitespace-nowrap');
    expect(subject).toHaveTextContent(`person ${label}`);
    // A presence rule is a two-part sentence: there is nothing to say about a
    // value it does not have.
    expect(
      preview?.querySelector('[data-rule-part="predicate"]'),
    ).not.toBeInTheDocument();
  });

  it('renders Ego as bold text without a glyph', () => {
    const { container } = renderRule(EGO_RULE);
    const ego = container.querySelector('[data-rule-entity="ego"]');

    expect(ego).toHaveTextContent('Ego');
    expect(ego).toHaveClass('font-bold');
    expect(
      container.querySelector('[data-rule-entity-glyph="ego"]'),
    ).not.toBeInTheDocument();
  });

  it('names an attribute whose type is only shown as colour and an icon', () => {
    renderRule(ALTER_RULE);

    expect(screen.getByLabelText('text attribute name')).toBeInTheDocument();
  });

  it('falls back to text for an attribute the codebook no longer describes', () => {
    renderRule({
      ...EGO_RULE,
      options: { ...EGO_RULE.options, variableType: undefined },
    });

    expect(screen.getByLabelText('text attribute name')).toBeInTheDocument();
  });
});

/**
 * Both layouts render the same sentence. They used to be written out once
 * each, and the copies had already drifted: the printable summary's attribute
 * pill had lost the text that says what kind of attribute it is, leaving a
 * coloured chip that reads as nothing at all.
 */
describe('the printable summary says the same thing as the editor preview', () => {
  it.each([
    ['an alter attribute rule', ALTER_RULE, 'text attribute name'],
    ['an ego attribute rule', EGO_RULE, 'text attribute name'],
    ['an ordinal attribute rule', EDGE_RULE, 'ordinal attribute closeness'],
  ])('names the attribute of %s', (_name, rule, description) => {
    const inline = render(
      <PreviewText type={rule.type} options={rule.options} />,
    );
    expect(
      within(inline.container).getByLabelText(description),
    ).toBeInTheDocument();
    inline.unmount();

    const summary = render(
      <PreviewText type={rule.type} options={rule.options} variant="summary" />,
    );
    expect(
      within(summary.container).getByLabelText(description),
    ).toBeInTheDocument();
  });

  /**
   * Compared without whitespace: the summary separates its phrases with the
   * gaps of its three-column grid rather than with text, so only the words
   * themselves — and their order — can be compared in a DOM with no CSS.
   */
  const sentenceOf = (markup: HTMLElement) =>
    (markup.textContent ?? '').replaceAll(/\s+/g, '');

  it.each([
    ['an alter attribute rule', ALTER_RULE],
    ['an ego attribute rule', EGO_RULE],
    ['a presence rule', TYPE_RULE],
    [
      'an alter rule whose operand is not chosen yet',
      { type: 'node', options: { ...TYPE_RULE.options, attribute: 'name' } },
    ],
  ])('reads the same sentence for %s', (_name, rule) => {
    const inline = render(
      <PreviewText type={rule.type} options={rule.options} />,
    );
    const inlineSentence = sentenceOf(inline.container);
    inline.unmount();

    const summary = render(
      <PreviewText type={rule.type} options={rule.options} variant="summary" />,
    );

    expect(inlineSentence).not.toBe('');
    expect(sentenceOf(summary.container)).toBe(inlineSentence);
  });

  /**
   * The summary lays a rule out in three columns so a page of rules
   * aligns under one another. `Value` renders one token per selected option
   * with a bare ", " between them, and as direct children of the grid every
   * token — and every separator — took a column of its own, wrapping the tail
   * of the list onto a second row underneath the entity. Reachable from
   * shipped content: the development protocol's stage 21 filters on a
   * categorical attribute with two selected options.
   */
  it('keeps a multi-value operand in the summary’s one operand column', () => {
    const { container } = render(
      <PreviewText
        type="node"
        options={{
          typeLabel: 'person',
          typeColor: 'node-color-seq-1',
          attribute: 'groups',
          variableType: 'categorical',
          operator: 'EXCLUDES',
          value: ['Family', 'Friends'],
        }}
        variant="summary"
      />,
    );

    // The operator is a column of its own, so its parent IS the three-column
    // grid — named by the rule's own structure rather than by a layout class.
    const grid = container.querySelector('[data-rule-part="operator"]')
      ?.parentElement as HTMLElement;
    const cells = [...grid.children];

    expect(container.querySelectorAll('[data-rule-part="value"]')).toHaveLength(
      2,
    );
    expect(cells).toHaveLength(3);
    expect(cells[2]).toHaveTextContent('Family, Friends');
    expect(cells[2]?.querySelectorAll('[data-rule-part="value"]')).toHaveLength(
      2,
    );
  });

  it('renders the operand without the editor preview’s dashed outline', () => {
    const { container } = render(
      <PreviewText
        type={ALTER_RULE.type}
        options={ALTER_RULE.options}
        variant="summary"
      />,
    );

    expect(container.querySelector('[data-rule-part="value"]')).not.toHaveClass(
      'border-dashed',
    );
  });
});
