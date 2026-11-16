import { beforeEach, describe, expect, it } from 'vitest';

import type { NcHostMenuToggleDetail } from '../public-types';
import '../element';

function mount(attributes: Record<string, string>, width: number) {
  const frame = document.createElement('div');
  frame.style.width = `${width}px`;
  const host = document.createElement('nc-site-navigation');
  for (const [name, value] of Object.entries(attributes)) {
    host.setAttribute(name, value);
  }
  frame.append(host);
  document.body.append(frame);
  return { frame, host };
}

async function rendered(host: HTMLElement) {
  await expect
    .poll(() => host.shadowRoot?.querySelectorAll('a').length ?? 0)
    .toBeGreaterThan(0);
}

/** The entries the visitor can see, in order. */
function visibleItems(host: HTMLElement) {
  return [
    ...(host.shadowRoot?.querySelectorAll<HTMLElement>(
      'nav li a, nav li button',
    ) ?? []),
  ]
    .filter((item) => item.checkVisibility())
    .map((item) => item.textContent?.trim());
}

const showsLinks = (host: HTMLElement) => host.matches(':state(links)');

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('<nc-site-navigation layout="embedded">', () => {
  it('fits its links to the room the host gives it, as that room changes', async () => {
    const { frame, host } = mount(
      { 'layout': 'embedded', 'active-item': 'community' },
      1600,
    );
    await rendered(host);

    // The layout it renders, for a host's styles to wait for.
    expect(host.matches(':state(embedded)')).toBe(true);
    expect(host.matches(':state(menu)')).toBe(false);
    await expect
      .poll(() => visibleItems(host))
      .toEqual([
        'Community',
        'Documentation',
        'Updates',
        'Protocol Gallery',
        'Software',
      ]);
    expect(showsLinks(host)).toBe(true);

    frame.style.width = '800px';
    await expect
      .poll(() => visibleItems(host))
      .toEqual(['Resources', 'Software']);
    expect(showsLinks(host)).toBe(true);

    frame.style.width = '320px';
    await expect.poll(() => showsLinks(host)).toBe(false);
    expect(visibleItems(host)).toEqual([]);
    // The logo stays, going to the website.
    expect(
      host.shadowRoot?.querySelector('a[aria-label="Network Canvas home"]'),
    ).toHaveProperty('href', 'https://networkcanvas.com/');

    frame.style.width = '1600px';
    await expect.poll(() => showsLinks(host)).toBe(true);
  });

  it('leaves out what the host’s own header supplies', async () => {
    const { host } = mount({ layout: 'embedded' }, 1600);
    await rendered(host);

    expect(host.shadowRoot?.querySelector('a[href="#main-content"]')).toBe(
      null,
    );
    expect(
      host.shadowRoot?.querySelector(
        'a[href="https://networkcanvas.com/download"]',
      ),
    ).toBe(null);
    // The host's header paints the background.
    expect(
      getComputedStyle(host.shadowRoot?.querySelector('.nc-root') ?? host)
        .backgroundColor,
    ).toBe('rgba(0, 0, 0, 0)');
  });

  it('opens the host’s menu from the host’s entry and takes focus back', async () => {
    const { host } = mount(
      {
        'layout': 'embedded',
        'active-item': 'community',
        'host-menu': 'closed',
      },
      1600,
    );
    await rendered(host);
    const trigger = host.shadowRoot?.querySelector<HTMLButtonElement>(
      '[part~="host-menu-trigger"]',
    );
    if (!trigger) throw new Error('Expected the host’s entry.');

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.textContent).toBe('Community');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // Its entry leads the links.
    expect(visibleItems(host)[0]).toBe('Community');

    const toggles: NcHostMenuToggleDetail[] = [];
    const record = (event: Event) => {
      if (event instanceof CustomEvent) toggles.push(event.detail);
    };
    // It bubbles, so a host can listen anywhere above the element.
    document.addEventListener('nc-host-menu-toggle', record);
    try {
      trigger.click();
    } finally {
      document.removeEventListener('nc-host-menu-toggle', record);
    }
    expect(toggles).toHaveLength(1);
    expect(toggles[0]?.anchor.left).toBe(trigger.getBoundingClientRect().left);

    host.setAttribute('host-menu', 'open');
    await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.blur();
    expect(host.focusHostMenuTrigger()).toBe(true);
    expect(host.shadowRoot?.activeElement).toBe(trigger);
  });

  it('has no entry to focus without a host menu', async () => {
    const { host } = mount(
      { 'layout': 'embedded', 'active-item': 'community' },
      1600,
    );
    await rendered(host);

    expect(host.focusHostMenuTrigger()).toBe(false);
    expect(
      host.shadowRoot?.querySelector(
        'a[href="https://community.networkcanvas.com/"]',
      ),
    ).not.toBe(null);
  });
});

describe('<nc-site-navigation layout="menu">', () => {
  it('lists the header’s links for the host’s menu', async () => {
    const { host } = mount(
      { 'layout': 'menu', 'active-item': 'community' },
      300,
    );
    await rendered(host);

    expect(
      host.shadowRoot
        ?.querySelector('a[href="https://community.networkcanvas.com/"]')
        ?.getAttribute('aria-current'),
    ).toBe('page');
    expect(
      host.shadowRoot?.querySelector('a[aria-label="Network Canvas home"]'),
    ).toBe(null);
    expect(host.shadowRoot?.querySelector('a[href="#main-content"]')).toBe(
      null,
    );
    expect(showsLinks(host)).toBe(false);
    expect(host.matches(':state(menu)')).toBe(true);
    expect(host.matches(':state(embedded)')).toBe(false);
  });
});
