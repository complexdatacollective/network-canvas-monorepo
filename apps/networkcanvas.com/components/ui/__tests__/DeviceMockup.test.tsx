import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DeviceMockup, type Variant } from '../DeviceMockup';

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
    render(<DeviceMockup variant={variant} />);

    expect(screen.getByRole('img', { name: alt })).toHaveAttribute('src', src);
  });
});
