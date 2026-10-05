import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../element';

function mount(attributes: Record<string, string> = {}, width = 1280) {
  const frame = document.createElement('div');
  frame.style.width = `${width}px`;
  const host = document.createElement('nc-site-navigation');
  for (const [name, value] of Object.entries(attributes)) {
    host.setAttribute(name, value);
  }
  frame.append(host);
  document.body.append(frame);
  return host;
}

function shadowLink(host: HTMLElement, href: string) {
  return host.shadowRoot?.querySelector(`a[href="${href}"]`) ?? null;
}

function themeWrapper(host: HTMLElement) {
  const wrapper = host.shadowRoot?.querySelector<HTMLElement>('.nc-root');
  if (!wrapper) throw new Error('Expected the nc-root wrapper.');
  return wrapper;
}

async function rendered(host: HTMLElement) {
  await expect
    .poll(() => host.shadowRoot?.querySelectorAll('a').length ?? 0)
    .toBeGreaterThan(0);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('<nc-site-navigation>', () => {
  it('registers and renders the canonical link set inside its shadow root', async () => {
    const host = mount();
    await rendered(host);

    expect(customElements.get('nc-site-navigation')).toBeDefined();
    expect(shadowLink(host, 'https://networkcanvas.com/')).not.toBeNull();
    expect(
      shadowLink(host, 'https://community.networkcanvas.com/'),
    ).not.toBeNull();
    expect(
      shadowLink(host, 'https://documentation.networkcanvas.com/'),
    ).not.toBeNull();
    expect(
      shadowLink(host, 'https://protocolgallery.networkcanvas.com/'),
    ).not.toBeNull();
    expect(
      shadowLink(host, 'https://networkcanvas.com/download'),
    ).not.toBeNull();
    // Nothing rendered into the light DOM.
    expect(host.querySelector('a')).toBeNull();
  });

  it('marks the active item with aria-current', async () => {
    const host = mount({ 'active-item': 'community' });
    await rendered(host);

    expect(
      shadowLink(host, 'https://community.networkcanvas.com/')?.getAttribute(
        'aria-current',
      ),
    ).toBe('page');
  });

  it('selects translated copy from the locale attribute', async () => {
    const host = mount({ locale: 'es' });
    await rendered(host);

    expect(
      host.shadowRoot?.querySelector('nav[aria-label="Navegación principal"]'),
    ).not.toBeNull();
  });

  it('resolves explicit themes and re-renders on attribute change', async () => {
    const host = mount({ theme: 'dark' });
    await rendered(host);

    expect(themeWrapper(host).getAttribute('data-theme')).toBe('dark');
    const darkBackground = getComputedStyle(themeWrapper(host)).backgroundColor;

    host.setAttribute('theme', 'light');
    await expect
      .poll(() => themeWrapper(host).getAttribute('data-theme'))
      .toBe('light');
    expect(getComputedStyle(themeWrapper(host)).backgroundColor).not.toBe(
      darkBackground,
    );
  });

  it('follows prefers-color-scheme when theme is auto', async () => {
    const host = mount();
    await rendered(host);

    const expected = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    expect(themeWrapper(host).getAttribute('data-theme')).toBe(expected);
  });

  it('warns and falls back on invalid attribute values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = mount({ 'theme': 'banana', 'active-item': 'nonsense' });
    await rendered(host);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('banana'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nonsense'));
    const expected = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    expect(themeWrapper(host).getAttribute('data-theme')).toBe(expected);
    warn.mockRestore();
  });

  it('opens the shadow root with a skip link aimed at the host page', async () => {
    const host = mount();
    await rendered(host);

    const focusable =
      host.shadowRoot?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [];

    expect(focusable[0]).toBe(shadowLink(host, '#main-content'));
    expect(focusable[0]?.textContent).toBe('Skip to main content');
  });

  it('aims the skip link at the id the host page names', async () => {
    const host = mount({ 'skip-to-id': 'docs-body' });
    await rendered(host);

    expect(shadowLink(host, '#docs-body')).not.toBeNull();
    expect(shadowLink(host, '#main-content')).toBeNull();
  });

  it('warns and keeps the default when skip-to-id is empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = mount({ 'skip-to-id': '   ' });
    await rendered(host);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skip-to-id'));
    expect(shadowLink(host, '#main-content')).not.toBeNull();
    warn.mockRestore();
  });

  it('follows the fragment out of the shadow root to the host page element', async () => {
    const host = mount();
    await rendered(host);
    // Push the target below the fold so that reaching it is visible as a
    // scroll, not just a hash. Both the hash and the scroll are the browser's
    // own doing: this activation is left to run its default action, which is
    // the part a shadow-root fragment could plausibly get wrong.
    const spacer = document.createElement('div');
    spacer.style.height = '300vh';
    const target = document.createElement('main');
    target.id = 'main-content';
    target.textContent = 'Host page content';
    document.body.append(spacer, target);
    const link = shadowLink(host, '#main-content');
    if (!(link instanceof HTMLAnchorElement)) {
      throw new Error('Expected the skip link.');
    }

    expect(window.scrollY).toBe(0);
    expect(location.hash).toBe('');

    try {
      link.click();

      await expect.poll(() => location.hash).toBe('#main-content');
      await expect.poll(() => window.scrollY).toBeGreaterThan(0);
      expect(target.getBoundingClientRect().top).toBeLessThan(
        window.innerHeight,
      );
      expect(document.activeElement).toBe(target);
    } finally {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      window.scrollTo(0, 0);
    }
  });

  it('lands focus on the host page element the shadow root cannot own', async () => {
    const host = mount();
    await rendered(host);
    const target = document.createElement('main');
    target.id = 'main-content';
    target.textContent = 'Host page content';
    document.body.append(target);

    // The fragment really navigates — that is the behaviour being relied on —
    // but letting the test runner's own page follow it ends the session. The
    // default action is cancelled after the element's handler has run, so what
    // is asserted here is the part the component is responsible for.
    const cancelNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', cancelNavigation);
    try {
      shadowLink(host, '#main-content')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, composed: true }),
      );
    } finally {
      document.removeEventListener('click', cancelNavigation);
    }

    // Focus left the shadow tree entirely: the host element is the active
    // element of the document, with no shadow descendant holding focus.
    expect(target.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(target);
    expect(host.shadowRoot?.activeElement).toBeNull();
  });

  it('injects the document-level styles exactly once across instances', async () => {
    const first = mount();
    const second = mount();
    await rendered(first);
    await rendered(second);

    expect(
      document.querySelectorAll('style[data-nc-site-navigation]'),
    ).toHaveLength(1);
  });
});
