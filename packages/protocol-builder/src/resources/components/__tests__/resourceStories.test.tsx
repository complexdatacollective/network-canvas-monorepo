import { composeStories } from '@storybook/react-vite';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import * as pickerStories from '../ResourcePickerControl.stories.tsx';
import * as previewStories from '../ResourcePreview.stories.tsx';
import * as secretStories from '../ResourceSecretControl.stories.tsx';
import * as uploadStories from '../ResourceUploadControl.stories.tsx';

/**
 * What this test needs of a composed story: something React can render with
 * the story's own args already bound, and the story's play function if it has
 * one. `canvasElement` is what a play is given in Storybook, so the element
 * the story rendered into is what its queries are scoped to here too.
 */
type ComposedStory = (() => ReactNode) &
  Readonly<{
    play?: (context: { canvasElement: HTMLElement }) => Promise<void>;
  }>;

function storiesIn(
  file: string,
  composed: Readonly<Record<string, ComposedStory>>,
): readonly (readonly [string, ComposedStory])[] {
  return Object.entries(composed).map(
    ([name, story]) => [`${file} — ${name}`, story] as const,
  );
}

/**
 * Every resource-picker story, mounted and played by the ordinary test run.
 *
 * Enumerated from the composed modules rather than listed here, so a story
 * added to one of those files is held by this test without anything being
 * remembered — and a story whose play stops passing fails here rather than
 * only in Storybook.
 */
const RESOURCE_STORIES = [
  ...storiesIn('Resource picker', composeStories(pickerStories)),
  ...storiesIn('API key control', composeStories(secretStories)),
  ...storiesIn('File import', composeStories(uploadStories)),
  ...storiesIn('Resource preview', composeStories(previewStories)),
];

describe('the resource picker stories', () => {
  it('has a story for every surface', () => {
    // A count rather than a list: it fails when a story is deleted, which is
    // the way this suite could silently stop covering something.
    expect(RESOURCE_STORIES.length).toBe(23);
  });

  it.each(RESOURCE_STORIES)('renders and plays %s', async (_name, Story) => {
    const { container } = render(<Story />);
    await Story.play?.({ canvasElement: container });
  });
});
