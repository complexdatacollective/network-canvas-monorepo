import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DeckCard, DeckCardFooter } from '../DeckCard';

// Each footer row's entry delay and exit duration, in mount order.
// Animations are off under test, so the transitions the card asks for are
// what is observable.
type FooterTiming = { entryDelay?: number; exitDuration?: number };
const { footerTimings } = vi.hoisted(() => ({
  footerTimings: new Array<FooterTiming>(),
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  const { useState } = await import('react');
  const ActualDiv = actual.motion.div;
  function RecordingDiv(props: ComponentProps<typeof ActualDiv>) {
    const footerRow = Reflect.get(props, 'data-deck-row') === 'footer';
    // Record once per mounted row: its entry is the transition it mounts with.
    useState(() => {
      if (footerRow) {
        const { animate, transition } = props;
        const entry =
          typeof animate === 'object' &&
          !Array.isArray(animate) &&
          'transition' in animate
            ? animate.transition
            : undefined;
        footerTimings.push({
          entryDelay: entry?.delay,
          exitDuration: transition?.duration,
        });
      }
      return null;
    });
    return <ActualDiv {...props} />;
  }
  const motion = new Proxy(actual.motion, {
    get: (target, key, receiver) =>
      key === 'div' ? RecordingDiv : Reflect.get(target, key, receiver),
  });
  return { ...actual, motion };
});

const protocol = {
  name: 'Friendship Ties',
  description: 'A description.',
  importedAt: '2026-05-20T10:00:00.000Z',
  lastModified: '2026-05-20T10:00:00.000Z',
};

function Card({
  isActive,
  footerKey,
}: {
  isActive: boolean;
  footerKey: string;
}) {
  return (
    <DeckCard
      protocol={protocol}
      isActive={isActive}
      sessionCount={0}
      onActivate={() => {}}
      footer={<DeckCardFooter key={footerKey}>{footerKey}</DeckCardFooter>}
    />
  );
}

describe('DeckCard footer entry', () => {
  it('holds a replacing footer back until the one it replaces has gone, but not a footer that appears fresh', () => {
    footerTimings.length = 0;
    const view = render(<Card isActive={false} footerKey="start" />);
    expect(footerTimings).toEqual([]);

    // Activation: a fresh appearance enters at once.
    view.rerender(<Card isActive footerKey="start" />);
    expect(footerTimings).toHaveLength(1);
    expect(footerTimings[0]?.entryDelay).toBeUndefined();

    // A replacement waits exactly as long as the outgoing footer takes to go.
    view.rerender(<Card isActive footerKey="form" />);
    expect(footerTimings).toHaveLength(2);
    const outgoingExit = footerTimings[0]?.exitDuration;
    expect(outgoingExit).toBeGreaterThan(0);
    expect(footerTimings[1]?.entryDelay).toBe(outgoingExit);

    // Re-rendering the replacement does not enter it again.
    view.rerender(<Card isActive footerKey="form" />);
    expect(footerTimings).toHaveLength(2);
  });
});
