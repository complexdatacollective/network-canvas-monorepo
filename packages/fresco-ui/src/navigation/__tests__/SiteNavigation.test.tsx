import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PortalContainerProvider } from '../../PortalContainer';
import SiteNavigation from '../SiteNavigation';
import { SITE_NAVIGATION_SKIP_TARGET_ID } from '../SiteNavigation.constants';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

describe('SiteNavigation skip link', () => {
  it('is the first focusable element in the header and reachable with one Tab', async () => {
    const user = userEvent.setup();
    render(<SiteNavigation locale="en-US" site="website" />);

    const header = screen.getByRole('banner');
    const skipLink = screen.getByRole('link', {
      name: 'Skip to main content',
    });

    // Ahead of everything else the header renders, including the brand link
    // that used to be first.
    expect(header.querySelectorAll(FOCUSABLE_SELECTOR)[0]).toBe(skipLink);
    expect(skipLink).toHaveAttribute('href', '#main-content');

    await user.tab();
    expect(skipLink).toHaveFocus();
  });

  it('links to the id the host page supplies', () => {
    render(
      <SiteNavigation locale="en-US" site="website" skipToId="content-start" />,
    );

    expect(
      screen.getByRole('link', { name: 'Skip to main content' }),
    ).toHaveAttribute('href', '#content-start');
  });

  it('translates the label with the rest of the navigation copy', () => {
    render(<SiteNavigation locale="es" site="website" />);

    expect(
      screen.getByRole('link', { name: 'Saltar al contenido principal' }),
    ).toHaveAttribute('href', '#main-content');
  });

  it('lands focus on the host target, making it focusable when it is not', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SiteNavigation locale="en-US" site="website" />
        <main id={SITE_NAVIGATION_SKIP_TARGET_ID}>Page content</main>
      </>,
    );

    const target = screen.getByRole('main');
    expect(target).not.toHaveAttribute('tabindex');

    await user.click(
      screen.getByRole('link', { name: 'Skip to main content' }),
    );

    expect(target).toHaveAttribute('tabindex', '-1');
    expect(target).toHaveFocus();
  });

  it('leaves a target the host already made focusable as it found it', async () => {
    const user = userEvent.setup();
    render(<SiteNavigation locale="en-US" site="website" />);

    // Built outside the render tree so the host's own `tabindex` is the thing
    // under test rather than something this file's JSX describes.
    const target = document.createElement('main');
    target.id = SITE_NAVIGATION_SKIP_TARGET_ID;
    target.tabIndex = 0;
    document.body.append(target);

    try {
      await user.click(
        screen.getByRole('link', { name: 'Skip to main content' }),
      );

      expect(target.getAttribute('tabindex')).toBe('0');
      expect(target).toHaveFocus();
    } finally {
      target.remove();
    }
  });

  it('does nothing when the host page has no matching target', async () => {
    const user = userEvent.setup();
    render(<SiteNavigation locale="en-US" site="website" />);

    const skipLink = screen.getByRole('link', {
      name: 'Skip to main content',
    });
    await user.click(skipLink);

    expect(document.getElementById(SITE_NAVIGATION_SKIP_TARGET_ID)).toBeNull();
    expect(skipLink).toHaveFocus();
  });
});

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
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/',
    );
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
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
    expect(screen.getByRole('link', { name: 'Documentación' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('link', { name: 'Documentación' }),
    ).not.toHaveAttribute('target');
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
    ).toHaveAttribute(
      'href',
      'https://networkcanvas.com/get-started#architect-classic-downloads',
    );
    expect(
      within(compactNavigation).getByRole('link', { name: 'Open Interviewer' }),
    ).toHaveAttribute('href', 'https://interviewer.networkcanvas.com/');
    expect(
      within(compactNavigation).getByRole('link', {
        name: 'Get Interviewer Classic',
      }),
    ).toHaveAttribute(
      'href',
      'https://networkcanvas.com/get-started#interviewer-classic-downloads',
    );
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
    const softwarePopup = architectClassicLink.closest('nav');
    if (!softwareGrid) throw new Error('Expected the software grid.');
    if (!softwarePopup) throw new Error('Expected the software popup.');
    const softwareViewport = softwarePopup.querySelector(':scope > div');
    if (!softwareViewport) throw new Error('Expected the software viewport.');

    expect(softwareGrid).toHaveClass('grid', 'grid-cols-3');
    expect(softwarePopup).toHaveClass(
      'h-(--popup-height)',
      'w-(--popup-width)',
    );
    expect(softwareViewport).toHaveClass('relative');
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
    expect(architectClassicLink).toHaveClass(
      'items-start',
      'gap-4',
      'p-5',
      'hover:bg-cyber-grape/10',
      '[[data-theme=dark]_&]:hover:bg-platinum-dark/10',
    );
    expect(architectClassicLink.querySelector('img')).toHaveAttribute(
      'alt',
      '',
    );
    expect(
      within(architectClassicLink).getByText('Architect Classic'),
    ).toHaveClass(
      'text-cyber-grape',
      '[[data-theme=dark]_&]:text-platinum-dark',
    );
    expect(
      within(architectClassicLink).getByText('Get Architect Classic'),
    ).toHaveClass('mt-auto');
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

  it('renders every destination absolutely for external hosts', () => {
    render(
      <SiteNavigation
        activeItemId="community"
        locale="en-US"
        site="external"
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Network Canvas home' }),
    ).toHaveAttribute('href', 'https://networkcanvas.com/');
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/',
    );
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      'https://networkcanvas.com/download',
    );
  });

  it('portals desktop menus into the app portal container when provided', () => {
    const { baseElement } = render(
      <PortalContainerProvider>
        <SiteNavigation locale="en-US" site="website" />
      </PortalContainerProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Software' }));
    const architectLink = screen.getByRole('link', { name: 'Architect' });
    const portalLayer = baseElement.querySelector('.z-3000');
    if (!portalLayer) throw new Error('Expected the portal container layer.');

    expect(portalLayer).toContainElement(architectLink);
  });

  it('keeps portaling to the document body without a provider', () => {
    render(<SiteNavigation locale="en-US" site="website" />);

    fireEvent.click(screen.getByRole('button', { name: 'Software' }));

    expect(screen.getByRole('link', { name: 'Architect' })).toBeInTheDocument();
  });
});
