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

  it('recommends current apps while explaining Classic maintenance use', () => {
    render(<GetStartedPage />);

    expect(screen.getByText('Recommended for new studies')).toBeInTheDocument();
    expect(screen.getByText('In person · Recommended')).toBeInTheDocument();
    expect(screen.getByText('Classic · Maintenance mode')).toBeInTheDocument();
    expect(screen.getByText('Classic · Existing studies')).toBeInTheDocument();
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

  it('includes the one-way compatibility warning and no standalone Server app', () => {
    render(<GetStartedPage />);

    expect(
      screen.getByText('Classic compatibility is one-way.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/schema 8 protocols cannot be opened in Classic apps/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /server/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Network Canvas Server/i),
    ).not.toBeInTheDocument();
  });
});
