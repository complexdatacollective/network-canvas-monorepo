import { cleanup, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { webApps } from '~/lib/getStarted';
import { classicApps } from '~/test/classicApps';
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
  it('names the featured app in a level-3 heading beside a white status badge', () => {
    renderWithIntl(<AppChoiceCard app={architect} />);

    expect(
      screen.getByRole('heading', { level: 3, name: architect.name }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByText('Recommended for new studies')
        .style.getPropertyValue('--badge-color'),
    ).toBe('var(--color-white)');
  });

  it('gives a non-featured app a cyber-grape status badge', () => {
    renderWithIntl(<AppChoiceCard app={fresco} />);

    expect(
      screen
        .getByText('Large Teams · Remote Administration · Recommended')
        .style.getPropertyValue('--badge-color'),
    ).toBe('var(--color-cyber-grape)');
  });

  it('gives each Classic platform link an app-specific accessible name', () => {
    renderWithIntl(<AppChoiceCard app={architectClassic} />);

    const appleSiliconLink = screen.getByRole('link', {
      name: 'Apple Silicon for Architect Classic',
    });

    expect(appleSiliconLink).toHaveAttribute('target', '_blank');
    expect(appleSiliconLink.closest('[id]')).toHaveAttribute(
      'id',
      'architect-classic-downloads',
    );
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

  it('keeps the Classic Android download option available', () => {
    renderWithIntl(<AppChoiceCard app={interviewerClassic} />);

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
