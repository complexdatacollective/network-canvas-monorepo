import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SiteNavigation from '../SiteNavigation';

describe('SiteNavigation', () => {
  it('owns the canonical English destinations and active state', () => {
    render(
      <SiteNavigation
        activeItemId="documentation"
        locale="en-US"
        site="website"
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Network Canvas home' }),
    ).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute(
      'href',
      'https://community.networkcanvas.com/',
    );
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/',
    );
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Protocol Gallery' }),
    ).toHaveAttribute('href', 'https://protocolgallery.networkcanvas.com/');
    expect(
      screen.getByRole('button', { name: 'Software' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      '/get-started',
    );
  });

  it('selects Spanish copy from the locale and resolves docs routing', () => {
    render(
      <SiteNavigation
        activeItemId="documentation"
        locale="es"
        site="documentation"
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Inicio de Network Canvas' }),
    ).toHaveAttribute('href', 'https://networkcanvas.com/');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Docs' })).not.toHaveAttribute(
      'target',
    );
    expect(
      screen.getByRole('link', { name: 'Galería de protocolos' }),
    ).toHaveAttribute('href', 'https://protocolgallery.networkcanvas.com/');
    expect(screen.getByRole('link', { name: 'Comenzar' })).toHaveAttribute(
      'href',
      'https://networkcanvas.com/download',
    );
  });

  it('renders the canonical compact groups and app-owned utility slot', () => {
    const renderUtility = vi.fn(({ view }: { view: 'desktop' | 'mobile' }) => (
      <button type="button">Theme {view}</button>
    ));

    render(
      <SiteNavigation
        locale="en-US"
        site="documentation"
        renderUtility={renderUtility}
      />,
    );

    expect(screen.getByText('Theme desktop')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open site navigation' }),
    );

    const compactNavigation = screen.getAllByRole('navigation', {
      name: 'Primary navigation',
    })[1];
    if (!compactNavigation) throw new Error('Expected compact navigation.');

    expect(
      within(compactNavigation).getByText('Resources'),
    ).toBeInTheDocument();
    expect(within(compactNavigation).getByText('Software')).toBeInTheDocument();
    expect(
      within(compactNavigation).getByRole('link', { name: 'Open Architect' }),
    ).toHaveAttribute('href', 'https://architect.networkcanvas.com/');
    expect(
      within(compactNavigation).getByRole('link', {
        name: 'Get Architect Classic',
      }),
    ).toHaveAttribute('href', 'https://networkcanvas.com/get-started#design');
    expect(
      within(compactNavigation).getByRole('link', { name: 'Open Interviewer' }),
    ).toHaveAttribute('href', 'https://interviewer.networkcanvas.com/');
    expect(
      within(compactNavigation).getByRole('link', {
        name: 'Get Interviewer Classic',
      }),
    ).toHaveAttribute('href', 'https://networkcanvas.com/get-started#collect');
    expect(
      within(compactNavigation).getByRole('link', {
        name: 'Try the Fresco Sandbox',
      }),
    ).toHaveAttribute('href', 'https://fresco-sandbox.networkcanvas.com/');
    expect(screen.getByText('Theme mobile')).toBeInTheDocument();
    expect(renderUtility).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'mobile' }),
    );
  });

  it('marks the resources group active when selected directly', () => {
    render(
      <SiteNavigation activeItemId="resources" locale="en-US" site="website" />,
    );

    const resourcesButton = screen.getByRole('button', { name: 'Resources' });
    expect(resourcesButton).toHaveAttribute('aria-current', 'page');
  });

  it('lays out modern apps above their Classic counterparts', () => {
    render(<SiteNavigation locale="en-US" site="website" />);

    fireEvent.click(screen.getByRole('button', { name: 'Software' }));
    const architectClassicLink = screen.getByRole('link', {
      name: 'Architect Classic',
    });
    const softwareGrid = architectClassicLink.closest('ul');
    if (!softwareGrid) throw new Error('Expected the software grid.');

    expect(softwareGrid).toHaveClass('grid', 'grid-cols-3');
    expect(within(softwareGrid).getAllByRole('listitem')).toHaveLength(5);
    expect(
      within(softwareGrid)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual([
      'Architect',
      'Interviewer',
      'Fresco',
      'Architect Classic',
      'Interviewer Classic',
    ]);
    expect(architectClassicLink).toHaveClass('p-5', 'hover:bg-mustard/10');
    expect(
      within(architectClassicLink).getByText('Architect Classic'),
    ).toHaveClass('text-mustard');
  });

  it('exposes an active compact navigation group semantically', () => {
    render(
      <SiteNavigation activeItemId="resources" locale="en-US" site="website" />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Open site navigation' }),
    );
    const compactNavigation = screen.getAllByRole('navigation', {
      name: 'Primary navigation',
    })[1];
    if (!compactNavigation) throw new Error('Expected compact navigation.');

    expect(within(compactNavigation).getByText('Resources')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('renders app-owned content beside the compact menu control', () => {
    render(
      <SiteNavigation
        locale="en-US"
        site="documentation"
        mobileAccessory={<span>Search documentation</span>}
      />,
    );

    expect(screen.getByText('Search documentation')).toBeInTheDocument();
    const menuButton = screen.getByRole('button', {
      name: 'Open site navigation',
    });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton.parentElement).toHaveClass('@min-[64rem]:hidden');
  });

  it('closes the compact menu after following a link', () => {
    render(<SiteNavigation locale="en-US" site="website" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Open site navigation' }),
    );
    const mobileCommunityLink = screen.getAllByRole('link', {
      name: 'Community',
    })[1];
    if (!mobileCommunityLink) {
      throw new Error('Expected a compact Community link.');
    }
    fireEvent.click(mobileCommunityLink);

    expect(
      screen.getByRole('button', { name: 'Open site navigation' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('returns focus to the compact trigger when Escape dismisses the menu', () => {
    render(<SiteNavigation locale="en-US" site="website" />);

    const menuButton = screen.getByRole('button', {
      name: 'Open site navigation',
    });
    fireEvent.click(menuButton);
    const mobileCommunityLink = screen.getAllByRole('link', {
      name: 'Community',
    })[1];
    if (!mobileCommunityLink) {
      throw new Error('Expected a compact Community link.');
    }
    mobileCommunityLink.focus();
    fireEvent.keyDown(mobileCommunityLink, { key: 'Escape' });

    expect(
      screen.getByRole('button', { name: 'Open site navigation' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveFocus();
  });
});
