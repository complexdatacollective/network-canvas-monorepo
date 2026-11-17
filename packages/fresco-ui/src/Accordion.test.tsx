import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from './Accordion';

function Fixture({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Accordion defaultValue={defaultOpen ? ['item'] : []}>
      <AccordionItem value="item">
        <AccordionHeader>
          <AccordionTrigger>Toggle</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <input aria-label="Inside" />
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

const overflowOf = () =>
  getComputedStyle(screen.getByRole('region', { hidden: true })).overflow;

const toggle = () => fireEvent.click(screen.getByRole('button'));

const sleep = (ms: number) =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

/**
 * jsdom performs no layout and paints nothing, so these tests prove only when
 * the panel asks to clip: that is the whole of the rule. That a focus ring is
 * then visible, and that nothing moves when the panel settles, are measured in
 * the Accordion story, which runs in a real browser.
 */
describe('AccordionPanel clipping', () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = false;
  });

  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  it('does not clip a panel that is open on first render', () => {
    render(<Fixture defaultOpen />);

    expect(overflowOf()).toBe('visible');
  });

  it('clips a panel that is closed on first render', () => {
    render(<Fixture />);

    expect(overflowOf()).toBe('hidden');
  });

  it('clips for the whole opening animation, then stops clipping', async () => {
    render(<Fixture />);

    toggle();
    expect(overflowOf()).toBe('hidden');

    await sleep(100);
    expect(overflowOf()).toBe('hidden');

    await waitFor(() => expect(overflowOf()).toBe('visible'));
  });

  it('clips from the first moment of closing', async () => {
    render(<Fixture defaultOpen />);

    toggle();

    expect(overflowOf()).toBe('hidden');
    await sleep(400);
    expect(overflowOf()).toBe('hidden');
  });

  it('keeps clipping when a toggle is interrupted before it settles', async () => {
    render(<Fixture />);

    toggle();
    await sleep(80);
    toggle();
    expect(overflowOf()).toBe('hidden');

    // Longer than the animation: a completion belonging to the cancelled
    // opening must not switch clipping off for a panel that is now closing.
    await sleep(500);
    expect(overflowOf()).toBe('hidden');
  });

  it('settles after a close that is interrupted by reopening', async () => {
    render(<Fixture defaultOpen />);

    toggle();
    await sleep(80);
    toggle();
    expect(overflowOf()).toBe('hidden');

    // Still inside the animation that began at the reopening.
    await sleep(100);
    expect(overflowOf()).toBe('hidden');

    await waitFor(() => expect(overflowOf()).toBe('visible'));
  });

  it('clips the whole animation of a panel that has opened and closed before', async () => {
    render(<Fixture defaultOpen />);

    toggle();
    await sleep(400);
    toggle();
    expect(overflowOf()).toBe('hidden');

    await sleep(100);
    expect(overflowOf()).toBe('hidden');

    await waitFor(() => expect(overflowOf()).toBe('visible'));
  });

  it('settles when Motion skips animations', async () => {
    MotionGlobalConfig.skipAnimations = true;
    render(<Fixture />);

    toggle();
    await waitFor(() => expect(overflowOf()).toBe('visible'));

    toggle();
    expect(overflowOf()).toBe('hidden');
    await sleep(100);
    expect(overflowOf()).toBe('hidden');
  });
});
