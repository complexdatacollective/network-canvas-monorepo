import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PreviewRule } from '../PreviewRule';

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
} as const;

const TYPE_RULE = {
  type: 'node',
  options: {
    typeLabel: 'person',
    typeColor: 'node-color-seq-1',
    operator: 'EXISTS',
  },
} as const;

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
} as const;

const EGO_RULE = {
  type: 'ego',
  options: {
    attribute: 'name',
    variableType: 'text',
    operator: 'EXACTLY',
    value: 'Bob',
  },
} as const;

const renderRule = (rule: { type: string; options: Record<string, unknown> }) =>
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

  it('renders a content-sized Markdown value without forcing bold text', () => {
    const { container } = renderRule({
      ...ALTER_RULE,
      options: { ...ALTER_RULE.options, value: 'Dee _and friends_' },
    });
    const value = container.querySelector('[data-rule-part="value"]');

    expect(value).toHaveTextContent('Dee and friends');
    expect(value?.querySelector('em')).toHaveTextContent('and friends');
    expect(value).toHaveClass(
      'max-w-full',
      'wrap-break-word',
      'whitespace-normal',
      'border-sea-green',
      'border-dashed',
      'rounded-sm',
    );
    expect(value).not.toHaveClass(
      'flex-1',
      'font-semibold',
      'border-b-[3px]',
      'border-dotted',
    );
  });

  it('renders each item in a multi-value operand with its own border', () => {
    const { container } = renderRule({
      ...EGO_RULE,
      options: {
        ...EGO_RULE.options,
        operator: 'INCLUDES',
        value: ['Family', '**No. I decline to** participate'],
      },
    });
    const preview = container.querySelector('#rule-text');
    const values = preview?.querySelectorAll('[data-rule-part="value"]');

    expect(values).toHaveLength(2);
    expect(values?.[0]).toHaveTextContent('Family');
    expect(values?.[1]).toHaveTextContent('No. I decline to participate');
    expect(values?.[1]?.querySelector('strong')).toHaveTextContent(
      'No. I decline to',
    );
    expect(preview).toHaveTextContent(
      'that includes Family, No. I decline to participate',
    );

    values?.forEach((value) => {
      expect(value).toHaveClass(
        'border-sea-green',
        'border-dashed',
        'rounded-sm',
      );
    });
  });

  it('renders the compact preview as one inline sentence that wraps naturally', () => {
    const { container } = renderRule(ALTER_RULE);
    const preview = container.querySelector('#rule-text');
    const subject = preview?.querySelector('[data-rule-part="subject"]');
    const predicate = preview?.querySelector('[data-rule-part="predicate"]');

    expect(preview).toHaveClass('block', 'text-wrap', 'leading-[2.5]');
    expect(preview).not.toHaveClass('leading-relaxed', 'leading-loose');
    expect(preview).not.toHaveClass('flex', 'flex-wrap');
    expect(subject).toHaveClass('inline');
    expect(predicate).toHaveClass('inline');
    expect(subject).toHaveTextContent(/person.*where.*name/);
    expect(subject?.querySelector('.size-8')).toBeInTheDocument();
    expect(predicate).toHaveTextContent(/is exactly equal to.*Dee/);
    expect(predicate?.querySelector('[data-rule-part="value"]')).toHaveClass(
      'wrap-break-word',
    );
  });

  it.each([
    ['node', ALTER_RULE, 'person'],
    ['edge', EDGE_RULE, 'friend'],
  ])(
    'renders the %s type as a small glyph followed by a bold label',
    (type, rule, label) => {
      const { container } = renderRule(rule);
      const entity = container.querySelector(`[data-rule-entity="${type}"]`);
      const glyph = entity?.querySelector(`[data-rule-entity-glyph="${type}"]`);

      expect(entity).toBeInTheDocument();
      expect(glyph).toHaveClass('size-8');
      expect(glyph).not.toHaveTextContent(label);
      expect(glyph).toHaveClass('inline-flex', 'align-middle');
      expect(entity).toHaveClass('inline');
      expect(within(entity as HTMLElement).getByText(label)).toHaveClass(
        'font-bold',
      );
      expect(within(entity as HTMLElement).getByText(label)).not.toHaveClass(
        '-top-0.5',
        'relative',
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
  ])('keeps a type rule with “%s” on one row', (_label, rule) => {
    const { container } = renderRule(rule);
    const preview = container.querySelector('#rule-text');
    const subject = preview?.querySelector('[data-rule-part="subject"]');

    expect(subject).toHaveClass('whitespace-nowrap');
    expect(subject).toHaveTextContent(`person ${_label}`);
    expect(subject?.querySelector('[data-rule-part="operator"]')).toBeVisible();
    expect(
      preview?.querySelector('[data-rule-part="predicate"]'),
    ).not.toBeInTheDocument();
  });

  it('renders Ego as bold text without a node glyph', () => {
    const { container } = renderRule(EGO_RULE);
    const ego = container.querySelector('[data-rule-entity="ego"]');

    expect(ego?.tagName).toBe('STRONG');
    expect(ego).toHaveClass('font-bold');
    expect(
      container.querySelector('[data-rule-entity-glyph="ego"]'),
    ).not.toBeInTheDocument();
  });
});
