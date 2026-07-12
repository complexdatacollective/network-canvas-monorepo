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
const interviewerClassic = classicApps.find(
  (app) => app.id === 'interviewer-classic',
);

if (!architect || !fresco || !architectClassic || !interviewerClassic) {
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

  it('uses Fresco typography and Badge for the featured app', () => {
    render(<AppChoiceCard app={architect} />);

    const heading = screen.getByRole('heading', {
      level: 3,
      name: architect.name,
    });
    const description = screen.getByText(architect.description);
    const status = screen.getByText(architect.status);

    expect(heading).toHaveClass('scroll-m-20', 'm-0!', 'text-3xl');
    expect(description).toHaveClass('font-body', 'mt-5');
    expect(description).not.toHaveClass('not-last:mb-[1em]');
    expect(status.tagName).toBe('DIV');
    expect(status).toHaveClass(
      'inline-flex',
      'border-0',
      'px-3',
      'py-1.5',
      'bg-white/15',
      'text-white',
    );
    expect(status).toHaveTextContent(architect.status);
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

    expect(screen.getByRole('article')).toHaveClass(
      'bg-slate-blue/10',
      'backdrop-blur-md',
    );

    expect(screen.getByText(fresco.status)).toHaveClass(
      'bg-cyber-grape/10',
      'text-cyber-grape',
    );
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

  it('shows a decorative icon for each Classic platform', () => {
    const platformIcons = [
      ['Apple Silicon', 'lucide-apple'],
      ['Apple Intel', 'lucide-apple'],
      ['Windows', 'lucide-monitor'],
      ['Linux', 'lucide-terminal'],
    ];

    for (const app of [architectClassic, interviewerClassic]) {
      render(<AppChoiceCard app={app} />);

      for (const [platform, iconClass] of platformIcons) {
        const link = screen.getByRole('link', {
          name: `${platform} for ${app.name}`,
        });
        const icon = link.querySelector(`.${iconClass}`);

        expect(icon).toBeInTheDocument();
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      }
    }
  });
});
