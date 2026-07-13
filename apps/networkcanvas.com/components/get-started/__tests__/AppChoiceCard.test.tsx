import { cleanup, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { classicApps, webApps } from '~/lib/getStarted';
import { renderWithIntl } from '~/test/renderWithIntl';

import { AppChoiceCard } from '../AppChoiceCard';

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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
    renderWithIntl(<AppChoiceCard app={architect} />);

    expect(screen.getByRole('article')).toHaveClass(
      'bg-cyber-grape',
      'text-white',
    );
  });

  it('uses Fresco typography and Badge for the featured app', () => {
    renderWithIntl(<AppChoiceCard app={architect} />);

    const heading = screen.getByRole('heading', {
      level: 3,
      name: architect.name,
    });
    const description = screen.getByText(
      'Design schema 8 protocols in your browser, with nothing to install. Use these protocols in Interviewer or Fresco.',
    );
    const status = screen.getByText('Recommended for new studies');

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
    expect(status).toHaveTextContent('Recommended for new studies');
  });

  it('uses the Classic treatment declared by Classic app data', () => {
    renderWithIntl(<AppChoiceCard app={architectClassic} />);

    expect(screen.getByRole('article')).toHaveClass(
      'bg-white/55',
      'backdrop-blur-md',
    );
  });

  it('uses the restrained Fresco treatment declared by app data', () => {
    renderWithIntl(<AppChoiceCard app={fresco} />);

    expect(screen.getByRole('article')).toHaveClass(
      'bg-slate-blue/10',
      'backdrop-blur-md',
    );

    expect(
      screen.getByText('Large Teams · Remote Administration · Recommended'),
    ).toHaveClass('bg-cyber-grape/10', 'text-cyber-grape');
  });

  it('gives each Classic platform link an app-specific accessible name', () => {
    renderWithIntl(<AppChoiceCard app={architectClassic} />);

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
      renderWithIntl(<AppChoiceCard app={app} />);

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

  it('keeps the Classic tablet download options available', () => {
    renderWithIntl(<AppChoiceCard app={interviewerClassic} />);

    expect(
      screen.getByRole('link', {
        name: 'iPhone and iPad for Interviewer Classic',
      }),
    ).toHaveAttribute(
      'href',
      'https://apps.apple.com/us/app/network-canvas-interviewer/id1538673677',
    );
    expect(
      screen.getByRole('link', {
        name: 'Android for Interviewer Classic',
      }),
    ).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=org.codaco.NetworkCanvasInterviewer6',
    );
  });

  it('localizes guidance and platform accessible names', () => {
    renderWithIntl(<AppChoiceCard app={architectClassic} />, 'es');

    expect(screen.getByText('Ideal para')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Apple Silicon para Architect Classic',
      }),
    ).toBeInTheDocument();
  });
});
