import { render } from '@testing-library/react';
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
});
