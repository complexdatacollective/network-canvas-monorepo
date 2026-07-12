import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import { DeviceMockup, type Variant } from '../DeviceMockup';

afterEach(cleanup);

vi.mock('next/image', () => ({
  default: ({
    alt,
    className,
    src,
  }: {
    alt: string;
    className?: string;
    src: string;
  }) => <img src={src} alt={alt} className={className} />,
}));

const cases: Array<{ variant: Variant; alt: string; src: string }> = [
  {
    variant: 'architect',
    alt: 'Architect protocol editor showing an interview design',
    src: '/images/screenshots/architect.png',
  },
  {
    variant: 'interviewer',
    alt: 'Interviewer home screen showing available Network Canvas protocols',
    src: '/images/screenshots/interviewer.png',
  },
  {
    variant: 'fresco',
    alt: 'Fresco dashboard showing protocol, participant, and interview totals',
    src: '/images/screenshots/fresco.png',
  },
];

describe('DeviceMockup', () => {
  it.each(cases)('renders the $variant screenshot', ({ variant, alt, src }) => {
    renderWithIntl(<DeviceMockup variant={variant} />);

    expect(screen.getByRole('img', { name: alt })).toHaveAttribute('src', src);
  });

  it('keeps the screenshot viewport at 4:3 without cropping', () => {
    const { container } = renderWithIntl(<DeviceMockup />);

    const image = within(container).getByRole('img', {
      name: 'Interviewer home screen showing available Network Canvas protocols',
    });

    expect(image).toHaveClass('object-contain');
    expect(image.parentElement).toHaveClass('aspect-4/3', 'w-full');
    expect(image.parentElement?.parentElement).not.toHaveClass('aspect-4/3');
  });

  it('localizes descriptive screenshot alternative text', () => {
    renderWithIntl(<DeviceMockup variant="architect" />, 'es');

    expect(
      screen.getByAltText(
        'Editor de protocolos de Architect que muestra el diseño de una entrevista',
      ),
    ).toBeInTheDocument();
  });
});
