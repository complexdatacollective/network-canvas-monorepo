import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentPropsWithoutRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Grant } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { Grants } from '../Grants';

const grants: Grant[] = [
  {
    id: 'fixture-grant-one',
    title: 'Fixture-only community research grant',
    pis: 'PI: Example Researcher',
    description: 'Fixture-only grant description.',
    logo: '/images/logos/uchicago.png',
    logoAlt: 'Example university',
    href: 'https://example.com/grants/one',
  },
  {
    id: 'fixture-grant-two',
    title: 'Fixture-only public health grant',
    pis: 'PI: Second Researcher',
    description: 'Second fixture-only grant description.',
    logo: '/images/logos/kentucky.png',
    logoAlt: 'Second example university',
    href: 'https://example.com/grants/two',
  },
];

vi.mock('@codaco/fresco-ui/typography/Heading', () => ({
  default: ({
    level = 'h2',
    margin,
    ...props
  }: ComponentPropsWithoutRef<'h3'> & {
    level?: 'h1' | 'h2' | 'h3' | 'h4' | 'label';
    margin?: 'default' | 'none';
  }) => {
    const Tag = level === 'label' ? 'h4' : level;

    return (
      <Tag data-fresco-heading="true" data-fresco-margin={margin} {...props} />
    );
  },
}));

vi.mock('@codaco/fresco-ui/typography/Paragraph', () => ({
  default: ({
    margin,
    ...props
  }: ComponentPropsWithoutRef<'p'> & {
    margin?: 'default' | 'none';
  }) => (
    <p data-fresco-paragraph="true" data-fresco-margin={margin} {...props} />
  ),
}));

afterEach(cleanup);

describe('Grants', () => {
  it('renders grant card copy with Fresco semantic typography', () => {
    renderWithIntl(<Grants grants={grants} />);

    const heading = screen.getByRole('heading', {
      level: 3,
      name: grants[0]?.title,
    });
    const pis = screen.getByText(grants[0]?.pis ?? '');
    const description = screen.getByText(grants[0]?.description ?? '');

    expect(heading).toHaveAttribute('data-fresco-heading', 'true');
    expect(heading).toHaveAttribute('data-fresco-margin', 'none');
    expect(heading.tagName).toBe('H3');
    expect(heading).toHaveClass(
      'font-heading',
      'text-cyber-grape',
      'text-xl',
      'font-bold',
    );

    for (const paragraph of [pis, description]) {
      expect(paragraph).toHaveAttribute('data-fresco-paragraph', 'true');
      expect(paragraph).toHaveAttribute('data-fresco-margin', 'none');
      expect(paragraph.tagName).toBe('P');
    }

    expect(pis).toHaveClass('text-text/55', 'mt-3', 'text-sm', 'font-bold');
    expect(description).toHaveClass(
      'text-text/80',
      'mt-4',
      'text-base',
      'leading-relaxed',
    );
    expect(
      screen.queryByText('Justice Community Opioid Innovation Network (JCOIN)'),
    ).not.toBeInTheDocument();
  });

  it('uses Fresco icon controls to paginate grants', () => {
    renderWithIntl(<Grants grants={grants} />);

    const previous = screen.getByRole('button', { name: 'Previous grant' });
    const next = screen.getByRole('button', { name: 'Next grant' });

    for (const control of [previous, next]) {
      expect(control).toHaveClass(
        'aspect-square',
        'p-0!',
        'size-11',
        'bg-surface',
        'shadow-lg',
      );
      expect(control.querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }

    fireEvent.click(next);

    expect(screen.getByRole('button', { name: 'Show grant 2' })).toHaveClass(
      'w-7',
    );

    fireEvent.click(previous);

    expect(screen.getByRole('button', { name: 'Show grant 1' })).toHaveClass(
      'w-7',
    );
  });

  it('keeps pagination dots as compact native buttons', () => {
    renderWithIntl(<Grants grants={grants} />);

    const secondGrant = screen.getByRole('button', { name: 'Show grant 2' });

    expect(secondGrant).toHaveClass('h-2.5', 'w-2.5');
    expect(secondGrant).not.toHaveClass('aspect-square', 'elevation-low');

    fireEvent.click(secondGrant);

    expect(secondGrant).toHaveClass('w-7');
    expect(screen.getByRole('button', { name: 'Show grant 1' })).toHaveClass(
      'w-2.5',
    );
  });

  it('keeps the slide clipped while leaving room for the card shadow', () => {
    renderWithIntl(<Grants grants={grants} />);

    const card = screen
      .getByRole('heading', { name: grants[0]?.title })
      .closest('a');
    const viewport = card?.parentElement;
    const frame = viewport?.parentElement;

    expect(frame).toHaveClass('relative', 'min-h-[22rem]', 'flex-1');
    expect(frame).not.toHaveClass('overflow-hidden');
    expect(viewport).toHaveClass(
      'absolute',
      '-inset-8',
      'overflow-hidden',
      'p-8',
      'pointer-events-none',
    );
    expect(card).toHaveClass('pointer-events-auto');
  });

  it('translates grant controls and section copy into Spanish', () => {
    renderWithIntl(<Grants grants={grants} />, 'es');

    expect(
      screen.getByRole('heading', {
        name: 'Subvenciones que utilizan Network Canvas',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Subvención anterior' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mostrar subvención 2' }),
    ).toBeInTheDocument();
  });
});
