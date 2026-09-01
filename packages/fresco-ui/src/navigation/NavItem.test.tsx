import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import NavItem, { type NavItemLinkRenderProps } from './NavItem';
import NavList from './NavList';

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

describe('NavItem, unavailable', () => {
  const billing = {
    href: '/team/1/billing',
    label: 'Billing',
    disabled: true,
    unavailableReason: 'Managed deployments only',
  } as const;

  it('renders no link', () => {
    renderInList(<NavItem {...billing} />);

    // Not a link with a dead href, and not a link that says it is disabled:
    // there is nothing here to follow, so nothing announces as followable.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders no href at all', () => {
    const list = renderInList(<NavItem {...billing} />);

    expect(list?.querySelector('[href]')).toBeNull();
  });

  it('keeps the row out of the tab order', () => {
    const list = renderInList(<NavItem {...billing} />);

    // Nothing focusable: a stop on a row that does nothing when activated is
    // noise, and a focus ring there promises an action that does not exist.
    expect(list?.querySelector('[tabindex]')).toBeNull();
    expect(list?.querySelector('a, button, [role]')).toBeNull();
  });

  it('does not claim a disabled widget state it has no role for', () => {
    const list = renderInList(<NavItem {...billing} />);

    // `aria-disabled` is honoured on widget roles. On a plain element it
    // announces nothing, and the roles that would make it mean something —
    // link, button — are exactly what this row must not be.
    expect(list?.querySelector('[aria-disabled]')).toBeNull();
  });

  it('says why the destination is unavailable, in visible text', () => {
    renderInList(<NavItem {...billing} />);

    // Visible, not a tooltip or a visually hidden string: an unfocusable row
    // can carry neither, and a dim row with no reason is the failure this
    // state exists to prevent.
    expect(screen.getByText('Managed deployments only')).toBeVisible();
  });

  it('is told apart from an enabled row by more than its colour', () => {
    const list = renderInList(<NavItem {...billing} icon={Users} />);

    // The destination's own icon, plus the lock — both hidden from assistive
    // technology, which has the reason sentence instead.
    const graphics = list?.querySelectorAll('svg') ?? [];
    expect(graphics).toHaveLength(2);
    for (const graphic of graphics) {
      expect(graphic).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('never asks the host to render a link', () => {
    const renderLink = vi.fn(({ children }: NavItemLinkRenderProps) => (
      <a href="/somewhere">{children}</a>
    ));

    renderInList(<NavItem {...billing} renderLink={renderLink} />);

    expect(renderLink).not.toHaveBeenCalled();
  });

  it('omits a count for a place this deployment does not have', () => {
    const list = renderInList(<NavItem {...billing} count={12} />);

    expect(list).not.toHaveTextContent('12');
  });

  it('still renders an li, so the list still counts it', () => {
    const list = renderInList(<NavItem {...billing} />);

    // How a screen reader finds this row: list navigation over the sidebar,
    // which enumerates every `<li>` whether or not it can hold focus.
    expect(list?.firstElementChild?.tagName).toBe('LI');
  });

  it('will not typecheck without a reason, or with one and no disabled', () => {
    // The pair is required together, and these two directives are the guard:
    // if either combination stops being an error, `tsc` fails on the unused
    // `@ts-expect-error`. A dimmed row nobody can explain is the failure this
    // state exists to avoid, so the explanation is not optional — and a reason
    // attached to a reachable destination is a caller who thinks they disabled
    // something they did not.
    renderInList(
      // @ts-expect-error `disabled` requires `unavailableReason`.
      <NavItem href="/team/1/billing" label="Billing" disabled />,
    );
    renderInList(
      // @ts-expect-error `unavailableReason` requires `disabled`.
      <NavItem href="/team/1/roles" label="Roles" unavailableReason="Nope" />,
    );

    // Both still render: the guard is the type, not a runtime throw.
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Roles' })).toBeInTheDocument();
  });

  it('sits in a NavList among destinations that can be reached', () => {
    render(
      <NavList>
        <NavItem href="/team/1/members" label="Members" count={4} />
        <NavItem href="/team/1/roles" label="Roles" />
        <NavItem {...billing} />
      </NavList>,
    );

    // Three list items, two of them links: the unavailable destination is
    // present and counted, and it is not one of the links.
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Members4', 'Roles'],
    );

    const billingRow = screen.getByText('Billing').closest('li');
    expect(billingRow).toHaveTextContent('Managed deployments only');
    expect(billingRow?.querySelector('a')).toBeNull();
  });
});
