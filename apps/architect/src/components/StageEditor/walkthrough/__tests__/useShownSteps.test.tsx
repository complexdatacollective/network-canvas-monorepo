import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { WalkthroughStep } from '../parseWalkthrough';
import { useShownSteps } from '../useShownSteps';
import { placeAmong } from '../walkthroughStore';

const STEPS: readonly WalkthroughStep[] = [
  { title: 'What it is', blocks: [] },
  { title: 'Prompts', blocks: [], section: 'prompts' },
  { title: 'Wording', blocks: [], section: 'built-in-wording' },
  { title: 'Preview', blocks: [], control: 'preview' },
];

function addSection(key: string) {
  const section = document.createElement('section');
  section.setAttribute('data-section-key', key);
  document.body.append(section);
  return section;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('useShownSteps', () => {
  it('leaves out a step about a section that is not on the page', () => {
    addSection('prompts');
    const { result } = renderHook(() => useShownSteps(STEPS));
    expect(result.current).toEqual([0, 1, 3]);
  });

  it('offers the step once its section appears, and drops it when it goes', async () => {
    addSection('prompts');
    const { result } = renderHook(() => useShownSteps(STEPS));

    let wording: HTMLElement | undefined;
    act(() => {
      wording = addSection('built-in-wording');
    });
    await waitFor(() => expect(result.current).toEqual([0, 1, 2, 3]));

    act(() => wording?.remove());
    await waitFor(() => expect(result.current).toEqual([0, 1, 3]));
  });
});

describe('placeAmong', () => {
  it('finds a step on offer', () => {
    expect(placeAmong(3, [0, 1, 3])).toBe(2);
  });

  it('moves on from a step that is no longer on offer', () => {
    expect(placeAmong(2, [0, 1, 3])).toBe(2);
  });

  it('stays on the last step when nothing later is on offer', () => {
    expect(placeAmong(9, [0, 1, 3])).toBe(2);
    expect(placeAmong(0, [])).toBe(0);
  });
});
