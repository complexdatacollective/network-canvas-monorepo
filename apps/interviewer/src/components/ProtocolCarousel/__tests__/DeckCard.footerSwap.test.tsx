import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DeckCard, DeckCardFooter } from '../DeckCard';

// Each footer row's entry delay, in mount order. Animations are off under
// test, so the transition the card asks for is what is observable.
const { footerEntryDelays } = vi.hoisted(() => ({
  footerEntryDelays: [] as (number | undefined)[],
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  const { useState } = await import('react');
  const ActualDiv = actual.motion.div;
  function RecordingDiv(props: ComponentProps<typeof ActualDiv>) {
    const footerRow = props['data-deck-row' as keyof typeof props] === 'footer';
    // Record once per mounted row: its entry is the transition it mounts with.
    useState(() => {
      if (footerRow) {
        const animate = props.animate as {
          transition?: { delay?: number };
        };
        footerEntryDelays.push(animate.transition?.delay);
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
    footerEntryDelays.length = 0;
    const view = render(<Card isActive={false} footerKey="start" />);
    expect(footerEntryDelays).toEqual([]);

    // Activation: a fresh appearance enters at once.
    view.rerender(<Card isActive footerKey="start" />);
    expect(footerEntryDelays).toEqual([undefined]);

    // A replacement waits for the outgoing footer's fade.
    view.rerender(<Card isActive footerKey="form" />);
    expect(footerEntryDelays).toEqual([undefined, 0.3]);

    // Re-rendering the replacement does not enter it again.
    view.rerender(<Card isActive footerKey="form" />);
    expect(footerEntryDelays).toEqual([undefined, 0.3]);
  });
});
