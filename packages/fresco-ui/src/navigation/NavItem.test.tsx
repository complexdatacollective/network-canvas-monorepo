import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import NavItem, { type NavItemLinkRenderProps } from './NavItem';

/** `<li>` only belongs inside a list, so every case renders one. */
const renderInList = (ui: ReactNode) =>
  render(<ul>{ui}</ul>).container.querySelector('ul');

describe('NavItem', () => {
  it('names the link from its label', () => {
    renderInList(<NavItem href="/participants" label="Participants" />);

    const link = screen.getByRole('link', { name: 'Participants' });
    expect(link).toHaveAttribute('href', '/participants');
  });

  it('folds a count into the link accessible name', () => {
    renderInList(
      <NavItem href="/participants" label="Participants" count={84} />,
    );

    // The number is INSIDE the link, so it is part of the link's name rather
    // than a stray "84" announced next to it.
    const link = screen.getByRole('link', { name: 'Participants 84' });
    expect(link).toHaveTextContent('84');
  });

  it('omits a zero count rather than rendering 0', () => {
    renderInList(
      <NavItem href="/participants" label="Participants" count={0} />,
    );

    const link = screen.getByRole('link', { name: 'Participants' });
    expect(link).not.toHaveTextContent('0');
  });

  it('omits a count that is not a usable number', () => {
    renderInList(
      <NavItem href="/participants" label="Participants" count={Number.NaN} />,
    );

    expect(screen.getByRole('link')).toHaveAccessibleName('Participants');
  });

  it('hides the leading icon from assistive technology', () => {
    renderInList(
      <NavItem href="/participants" label="Participants" icon={Users} />,
    );

    const link = screen.getByRole('link');
    // The icon repeats the label; announcing both says everything twice.
    expect(link).toHaveAccessibleName('Participants');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks the current destination with aria-current=page', () => {
    renderInList(<NavItem href="/participants" label="Participants" current />);

    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('leaves aria-current off every other destination', () => {
    renderInList(<NavItem href="/participants" label="Participants" />);

    // Absent, not `aria-current="false"`: a link that says it is not the
    // current page is noise on every row of the sidebar.
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current');
  });

  it('renders the host link element and hands it every prop', () => {
    const renderLink = vi.fn(
      ({ children, ...props }: NavItemLinkRenderProps) => (
        <a data-testid="host-link" {...props}>
          {children}
        </a>
      ),
    );

    renderInList(
      <NavItem
        href="/participants"
        label="Participants"
        current
        renderLink={renderLink}
      />,
    );

    const link = screen.getByTestId('host-link');
    expect(link).toHaveAttribute('href', '/participants');
    expect(link).toHaveAttribute('aria-current', 'page');
    // The styling reaches the host's element rather than being dropped with
    // the render prop.
    expect(link.className).toContain('focusable');
    expect(renderLink).toHaveBeenCalledTimes(1);
  });

  it('renders an li so it is valid inside a list', () => {
    const list = renderInList(<NavItem href="/waves" label="Waves" />);

    expect(list?.firstElementChild?.tagName).toBe('LI');
  });

  it('keeps the destination in the tab order', () => {
    renderInList(<NavItem href="/waves" label="Waves" />);

    // A sidebar is a list of links operated by Tab, not a composite widget
    // with roving focus — nothing may be taken out of the tab order.
    expect(screen.getByRole('link')).not.toHaveAttribute('tabindex');
  });
});
