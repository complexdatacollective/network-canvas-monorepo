import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { enIntl } from '../../testing/i18n.ts';
import { describeRule } from '../ruleDescription.ts';
import RulePreview from '../RulePreview.tsx';
import { testCodebook } from './fixtures.ts';

/**
 * The attribute in a rule sentence is the builder's own attribute pill.
 *
 * Architect's rule sentence drew a filled, type-coloured variable pill, and
 * the `.variable-pill` cascades this sentence and the printable summary carry
 * are the ones written for it — so a rule read back with an outline chip was
 * the one place in the builder where an attribute did not look like one.
 * Asserted through what the pill IS rather than through a class name: the
 * accent custom property and the icon are what a researcher sees.
 */
const ruleAbout = (attribute: string) => ({
  id: 'rule-1',
  type: 'node',
  options: {
    type: 'person',
    attribute,
    operator: 'GREATER_THAN',
    value: 30,
  },
});

const previewOf = (attribute: string) =>
  render(
    <RulePreview
      description={describeRule({
        rule: ruleAbout(attribute),
        codebook: testCodebook,
        intl: enIntl,
      })}
    />,
  );

const pillIn = (part: HTMLElement) => {
  const pill = part.querySelector<HTMLElement>('data');
  if (pill === null) throw new Error('The rule drew no attribute pill.');
  return pill;
};

const attributePart = () => {
  const part = document.querySelector<HTMLElement>(
    '[data-rule-part="attribute"]',
  );
  if (part === null) throw new Error('The rule named no attribute.');
  return part;
};

describe('the attribute in a rule sentence', () => {
  it('is drawn as the attribute pill, in the accent of its kind of answer', () => {
    previewOf('age');
    const pill = pillIn(attributePart());

    // `--paradise-pink` is the number accent in `AttributePill`'s own table,
    // which that component's test pins against the icon files.
    expect(pill.style.getPropertyValue('--variable-pill-accent')).toBe(
      'oklch(var(--paradise-pink))',
    );
    expect(pill).toHaveAttribute('data-attribute-type', 'number');
    expect(pill).toHaveClass('variable-pill');
    // The icon is the other half of what the pill says without words, and an
    // outline chip has none.
    expect(pill.querySelector('img')).toBeInTheDocument();
    expect(pill).toHaveTextContent('Age');
  });

  it('still says in words what kind of answer it is', () => {
    previewOf('mood');

    expect(screen.getByLabelText('Mood (attribute type: categorical)')).toBe(
      attributePart(),
    );
  });

  it('wears the destructive accent when the codebook no longer has it', () => {
    previewOf('gone_from_the_codebook');
    const part = attributePart();
    const pill = pillIn(part);

    expect(pill).toHaveAttribute('data-attribute-missing', '');
    expect(pill.style.getPropertyValue('--variable-pill-accent')).toBe(
      'var(--destructive)',
    );
    // Visible AND described: a researcher who cannot see the accent is told
    // why the rule cannot be read back.
    expect(part).toHaveAttribute(
      'aria-label',
      'gone_from_the_codebook (attribute is no longer in the codebook)',
    );
  });

  it('leaves an attribute the codebook still has unmarked', () => {
    previewOf('age');

    expect(pillIn(attributePart())).not.toHaveAttribute(
      'data-attribute-missing',
    );
  });
});
