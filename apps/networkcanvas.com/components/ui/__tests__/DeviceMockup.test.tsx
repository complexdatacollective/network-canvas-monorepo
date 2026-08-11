import { cleanup, screen } from '@testing-library/react';
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

const cases: Array<{
  variant: Variant;
  alt: string;
  aspectRatio: 'aspect-4/3' | 'aspect-7/5';
  src: string;
}> = [
  {
    variant: 'architect',
    alt: 'Architect protocol editor showing an interview design',
    aspectRatio: 'aspect-4/3',
    src: '/images/screenshots/architect.png',
  },
  {
    variant: 'interviewer',
    alt: 'Interviewer home screen showing available Network Canvas protocols',
    aspectRatio: 'aspect-7/5',
    src: '/images/screenshots/interviewer.png',
  },
  {
    variant: 'fresco',
    alt: 'Fresco dashboard showing protocol, participant, and interview totals',
    aspectRatio: 'aspect-7/5',
    src: '/images/screenshots/fresco.png',
  },
];

describe('DeviceMockup', () => {
  it.each(cases)(
    'renders the $variant screenshot at its source aspect ratio',
    ({ variant, alt, aspectRatio, src }) => {
      renderWithIntl(<DeviceMockup variant={variant} />);

      const image = screen.getByRole('img', { name: alt });

      expect(image).toHaveAttribute('src', src);
      expect(image).toHaveClass('object-contain');
      expect(image.parentElement).toHaveClass(aspectRatio, 'w-full');
      expect(image.parentElement?.parentElement).not.toHaveClass(aspectRatio);
    },
  );

  it('localizes descriptive screenshot alternative text', () => {
    renderWithIntl(<DeviceMockup variant="architect" />, 'es');

    expect(
      screen.getByAltText(
        'Editor de protocolos de Architect que muestra el diseño de una entrevista',
      ),
    ).toBeInTheDocument();
  });
});
