import { beforeEach, describe, expect, it } from 'vitest';

import '../element';

function mount(width: number) {
  const frame = document.createElement('div');
  frame.style.width = `${width}px`;
  const host = document.createElement('nc-site-navigation');
  frame.append(host);
  document.body.append(frame);
  return host;
}

function shadowButton(host: HTMLElement, label: string) {
  const buttons = host.shadowRoot?.querySelectorAll('button') ?? [];
  for (const button of buttons) {
    if (
      button.textContent?.includes(label) ||
      button.getAttribute('aria-label') === label
    ) {
      return button;
    }
  }
  return null;
}

async function rendered(host: HTMLElement) {
  await expect
    .poll(() => host.shadowRoot?.querySelectorAll('a').length ?? 0)
    .toBeGreaterThan(0);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('<nc-site-navigation> interactions', () => {
  it('opens the Software menu with its popup inside the shadow root', async () => {
    const host = mount(1280);
    await rendered(host);

    const trigger = shadowButton(host, 'Software');
    expect(trigger).not.toBeNull();
    trigger?.click();

    await expect
      .poll(() => host.shadowRoot?.querySelector('a[aria-label="Architect"]'))
      .not.toBeNull();
    const architect = host.shadowRoot?.querySelector(
      'a[aria-label="Architect"]',
    );
    expect(architect?.getRootNode()).toBe(host.shadowRoot);
  });

  it('opens and closes the compact drawer, restoring trigger focus on Escape', async () => {
    const host = mount(400);
    await rendered(host);

    const menuButton = shadowButton(host, 'Open site navigation');
    expect(menuButton).not.toBeNull();
    menuButton?.click();

    await expect
      .poll(() => menuButton?.getAttribute('aria-expanded'))
      .toBe('true');

    // The drawer is the second <nav>; the desktop menu's <nav> renders first
    // (hidden below the container breakpoint but still in the DOM).
    const navs = host.shadowRoot?.querySelectorAll('nav') ?? [];
    const drawer = navs[1];
    if (!drawer) throw new Error('Expected the compact drawer navigation.');
    const firstLink = drawer.querySelector<HTMLElement>('a');
    if (!firstLink) throw new Error('Expected a drawer link.');
    firstLink.focus();
    firstLink.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        composed: true,
      }),
    );

    await expect
      .poll(() => menuButton?.getAttribute('aria-expanded'))
      .toBe('false');
    expect(host.shadowRoot?.activeElement).toBe(menuButton);
  });
});
