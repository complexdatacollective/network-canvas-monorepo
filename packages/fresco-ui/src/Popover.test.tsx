import type { Popover as BasePopover } from '@base-ui/react/popover';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from './Popover';

type PositionerProps = ComponentProps<typeof BasePopover.Positioner>;

// What each render of Base UI's positioner was handed. jsdom lays nothing
// out, so where the popup stands cannot be measured here (the story
// "Stays inside a frame" measures it in a browser); what reaches the
// positioner can.
const positioned = vi.hoisted(() => ({ props: [] as PositionerProps[] }));

vi.mock('@base-ui/react/popover', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@base-ui/react/popover')>();
  const RealPositioner = actual.Popover.Positioner;
  function Positioner(props: PositionerProps) {
    positioned.props.push(props);
    return <RealPositioner {...props} />;
  }
  return { ...actual, Popover: { ...actual.Popover, Positioner } };
});

beforeEach(() => {
  positioned.props.length = 0;
});

describe('Popover', () => {
  /** The popup is a `role="dialog"`, and one with no name is announced as nothing. */
  it('names the popup after its PopoverTitle', async () => {
    render(
      <Popover>
        <PopoverTrigger>Open filters</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Filter sessions</PopoverTitle>
          <p>Narrow the list.</p>
        </PopoverContent>
      </Popover>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open filters' }));

    expect(
      await screen.findByRole('dialog', { name: 'Filter sessions' }),
    ).toBeInTheDocument();
  });

  /**
   * Prose and forms get the roomy padding; a popup that holds a list of
   * options asks for the padding menus and comboboxes use.
   */
  it('pads the popup for prose unless a smaller spacing is asked for', async () => {
    render(
      <>
        <Popover>
          <PopoverTrigger>Open help</PopoverTrigger>
          <PopoverContent aria-label="Help">Some prose.</PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger>Open list</PopoverTrigger>
          <PopoverContent aria-label="List" spacing="xs">
            A list of options.
          </PopoverContent>
        </Popover>
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open help' }));
    const help = await screen.findByRole('dialog', { name: 'Help' });
    // The padding is on the surface inside the dialog, which holds the content.
    const helpSurface = within(help).getByText('Some prose.');
    expect(helpSurface).toHaveClass('px-8', 'py-6');

    await userEvent.click(screen.getByRole('button', { name: 'Open list' }));
    const list = await screen.findByRole('dialog', { name: 'List' });
    const listSurface = within(list).getByText('A list of options.');
    expect(listSurface).toHaveClass('px-4', 'py-3');
    expect(listSurface).not.toHaveClass('px-8', 'py-6');
  });

  /**
   * A popup over a page that scrolls inside an app's own frame keeps inside
   * that frame and clear of the bars along its edges, and one under a block as
   * wide as the page stays on its side rather than jumping beside the block.
   */
  it('hands its positioner how to keep clear of the edges of its frame', async () => {
    const frame = document.createElement('div');
    document.body.append(frame);
    const avoidance = { side: 'shift', fallbackAxisSide: 'none' } as const;
    const padding = { top: 96, bottom: 90 };

    render(
      <Popover>
        <PopoverTrigger>Open settings</PopoverTrigger>
        <PopoverContent
          aria-label="Settings"
          collisionAvoidance={avoidance}
          collisionPadding={padding}
          collisionBoundary={frame}
        >
          Settings
        </PopoverContent>
      </Popover>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Open settings' }),
    );
    await screen.findByRole('dialog', { name: 'Settings' });

    expect(positioned.props.length).toBeGreaterThan(0);
    expect(positioned.props.at(-1)).toMatchObject({
      collisionAvoidance: avoidance,
      collisionPadding: padding,
      collisionBoundary: frame,
    });
    frame.remove();
  });

  it('leaves the positioner to its own defaults when none are given', async () => {
    render(
      <Popover>
        <PopoverTrigger>Open help</PopoverTrigger>
        <PopoverContent aria-label="Help">Help</PopoverContent>
      </Popover>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open help' }));
    await screen.findByRole('dialog', { name: 'Help' });

    const props = positioned.props.at(-1);
    expect(props?.collisionAvoidance).toBeUndefined();
    expect(props?.collisionPadding).toBeUndefined();
    expect(props?.collisionBoundary).toBeUndefined();
  });
});
