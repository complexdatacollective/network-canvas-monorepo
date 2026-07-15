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
