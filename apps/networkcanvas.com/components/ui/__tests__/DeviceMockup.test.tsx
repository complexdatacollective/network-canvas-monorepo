import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';
import { expectFrameToMatchScreenshot } from '~/test/screenshotAspectRatio';

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
  src: string;
}> = [
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
  it.each(cases)(
    'renders the $variant screenshot in a frame of its own aspect ratio',
    ({ variant, alt, src }) => {
      renderWithIntl(<DeviceMockup variant={variant} />);

      const image = screen.getByRole('img', { name: alt });

      expect(image).toHaveAttribute('src', src);
      expectFrameToMatchScreenshot(image);
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
