import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GetStartedPage, { metadata } from '../page';

vi.mock('~/components/ui/PageBackground', () => ({
  PageBackground: () => null,
}));

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

afterEach(cleanup);

describe('Get Started page', () => {
  it('uses purpose-first metadata', () => {
    expect(metadata).toEqual({
      title: 'Get Started',
      description:
        'Choose the right Network Canvas app for designing a protocol or collecting network data.',
    });
  });

  it('opens with one workflow question and two anchor choices', () => {
    render(<GetStartedPage />);

    expect(
      screen.getAllByRole('heading', {
        level: 1,
        name: 'What would you like to do?',
      }),
    ).toHaveLength(1);
    expect(
      screen.getByRole('link', {
        name: 'Design or create an interview protocol',
      }),
    ).toHaveAttribute('href', '#design');
    expect(
      screen.getByRole('link', {
        name: 'Collect data using Network Canvas',
      }),
    ).toHaveAttribute('href', '#collect');
  });

  it('renders linkable workflow sections with semantic headings', () => {
    render(<GetStartedPage />);

    const design = document.querySelector<HTMLElement>('#design');
    const collect = document.querySelector<HTMLElement>('#collect');

    expect(design).toBeInTheDocument();
    expect(collect).toBeInTheDocument();
    expect(
      within(design ?? document.body).getByRole('heading', {
        level: 2,
        name: 'Design or create a protocol',
      }),
    ).toBeInTheDocument();
    expect(
      within(collect ?? document.body).getByRole('heading', {
        level: 2,
        name: 'Collect data',
      }),
    ).toBeInTheDocument();
  });

  it('lays out current and Classic Collect apps in workflow order', () => {
    render(<GetStartedPage />);

    const collect = document.querySelector<HTMLElement>('#collect');

    if (!collect) {
      throw new Error('Expected the Collect workflow section to be present.');
    }

    const appNames = ['Interviewer', 'Fresco', 'Interviewer Classic'];
    const cards = appNames.map((appName) =>
      within(collect)
        .getByRole('heading', { level: 3, name: appName })
        .closest('article'),
    );

    expect(
      within(collect)
        .getAllByRole('heading', { level: 3 })
        .map(({ textContent }) => textContent),
    ).toEqual(appNames);

    for (const card of cards.slice(0, 2)) {
      expect(card?.parentElement).toHaveClass('tablet-landscape:col-span-6');
    }

    expect(cards[2]?.parentElement).toHaveClass('tablet-landscape:col-span-12');
    expect(cards[2]?.parentElement).not.toHaveClass(
      'tablet-landscape:col-start-8',
    );
  });

  it('links Fresco actions and all four platforms for each Classic app', () => {
    render(<GetStartedPage />);

    expect(
      screen.getByRole('link', { name: 'Try the Fresco Sandbox' }),
    ).toHaveAttribute('href', 'https://fresco-sandbox.networkcanvas.com/');
    expect(
      screen.getByRole('link', { name: 'Deployment Guide' }),
    ).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/fresco/deployment/guide',
    );

    for (const appName of ['Architect Classic', 'Interviewer Classic']) {
      for (const platform of [
        'Apple Silicon',
        'Apple Intel',
        'Windows',
        'Linux',
      ]) {
        expect(
          screen.getByRole('link', { name: `${platform} for ${appName}` }),
        ).toBeInTheDocument();
      }
    }
  });

  it('places the one-way compatibility warning within the Design path', () => {
    render(<GetStartedPage />);

    const warning = screen.getByRole('status');
    const designDescription = screen.getByText(
      'Build a new browser-based study in Architect, or keep a schema 7 workflow in Architect Classic when compatibility requires it.',
    );
    const architectHeading = screen.getByRole('heading', {
      level: 3,
      name: 'Architect',
    });
    const collect = document.querySelector<HTMLElement>('#collect');

    if (!collect) {
      throw new Error('Expected the Collect workflow section to be present.');
    }

    expect(warning).toHaveTextContent('Classic compatibility is one-way.');
    expect(
      designDescription.compareDocumentPosition(warning) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      warning.compareDocumentPosition(architectHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      collect.compareDocumentPosition(warning) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeFalsy();
    expect(within(collect).queryByRole('status')).toBeNull();
  });

  it('does not include a standalone Server app', () => {
    render(<GetStartedPage />);

    expect(
      screen.queryByRole('heading', { name: /server/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Network Canvas Server/i),
    ).not.toBeInTheDocument();
  });
});
