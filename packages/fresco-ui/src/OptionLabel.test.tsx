import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OptionLabel, { optionLabelText } from './OptionLabel';

describe('OptionLabel', () => {
  it('renders markdown emphasis instead of its syntax', () => {
    const { container } = render(
      <OptionLabel label="**Regularly** (3+ times/week)" />,
    );

    expect(screen.getByText('Regularly').tagName).toBe('STRONG');
    expect(container).toHaveTextContent('Regularly (3+ times/week)');
    expect(container.textContent).not.toContain('**');
  });

  it('shows the characters the editor stores escaped', () => {
    const { container } = render(
      <OptionLabel label="Sometimes (&lt;3) &amp; Don&#39;t know" />,
    );

    expect(container).toHaveTextContent("Sometimes (<3) & Don't know");
  });

  it('renders into a span when no element is given', () => {
    const { container } = render(<OptionLabel label="Weekly" />);

    expect(container.firstElementChild?.tagName).toBe('SPAN');
    expect(container.firstElementChild).toHaveTextContent('Weekly');
  });

  it('renders into the element given to render, keeping its props', () => {
    render(
      <OptionLabel
        label="*Monthly*"
        render={<div className="text-sm" data-testid="label" />}
      />,
    );

    const element = screen.getByTestId('label');
    expect(element.tagName).toBe('DIV');
    expect(element).toHaveClass('text-sm');
    expect(element.querySelector('em')).toHaveTextContent('Monthly');
  });

  it('sets the language and direction of a translated label', () => {
    render(
      <OptionLabel
        label={{ text: '**نعم**', lang: 'ar', dir: 'rtl' }}
        render={<span data-testid="label" />}
      />,
    );

    const element = screen.getByTestId('label');
    expect(element).toHaveAttribute('lang', 'ar');
    expect(element).toHaveAttribute('dir', 'rtl');
    expect(element.querySelector('strong')).toHaveTextContent('نعم');
  });

  it('keeps the language attributes of the given element for a plain string label', () => {
    render(
      <OptionLabel
        label="Oui"
        render={<span lang="fr" dir="ltr" data-testid="label" />}
      />,
    );

    expect(screen.getByTestId('label')).toHaveAttribute('lang', 'fr');
  });
});

describe('optionLabelText', () => {
  it('returns the label as the words a reader sees', () => {
    expect(optionLabelText('**In person** &amp; _by phone_')).toBe(
      'In person & by phone',
    );
  });

  it('reads the text of a translated label', () => {
    expect(optionLabelText({ text: '*Oui*', lang: 'fr', dir: 'ltr' })).toBe(
      'Oui',
    );
  });
});
