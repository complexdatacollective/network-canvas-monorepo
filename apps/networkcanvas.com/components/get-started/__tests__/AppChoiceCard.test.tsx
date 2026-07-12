import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { classicApps, webApps } from '~/lib/getStarted';

import { AppChoiceCard } from '../AppChoiceCard';

afterEach(cleanup);

const architect = webApps.find((app) => app.id === 'architect');
const fresco = webApps.find((app) => app.id === 'fresco');
const architectClassic = classicApps.find(
  (app) => app.id === 'architect-classic',
);

if (!architect || !fresco || !architectClassic) {
  throw new Error('Expected Get Started app test data is missing.');
}

describe('AppChoiceCard', () => {
  it('uses the featured treatment declared by current app data', () => {
    render(<AppChoiceCard app={architect} />);

    expect(screen.getByRole('article')).toHaveClass(
      'bg-cyber-grape',
      'text-white',
    );
  });

  it('uses the Classic treatment declared by Classic app data', () => {
    render(<AppChoiceCard app={architectClassic} />);

    expect(screen.getByRole('article')).toHaveClass(
      'bg-white/55',
      'backdrop-blur-md',
    );
  });

  it('uses the restrained Fresco treatment declared by app data', () => {
    render(<AppChoiceCard app={fresco} />);

    expect(screen.getByRole('article')).toHaveClass('bg-slate-blue/10');
  });

  it('gives each Classic platform link an app-specific accessible name', () => {
    render(<AppChoiceCard app={architectClassic} />);

    expect(
      screen.getByRole('link', {
        name: 'Apple Silicon for Architect Classic',
      }),
    ).toHaveAttribute('target', '_blank');
    expect(
      screen.getByRole('link', { name: 'Apple Intel for Architect Classic' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Windows for Architect Classic' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Linux for Architect Classic' }),
    ).toBeInTheDocument();
  });
});
