import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import Prompts from '../Prompts';

// Each prompt says which way it came in.
vi.mock('../Prompt', () => ({
  default: ({ id, backwards }: { id: string; backwards?: boolean }) => (
    <div
      data-testid="prompt"
      data-prompt-id={id}
      data-backwards={String(backwards)}
    />
  ),
}));

const prompts = [
  { id: 'first', text: { en: 'First' } },
  { id: 'second', text: { en: 'Second' } },
  { id: 'third', text: { en: 'Third' } },
];

const view = (currentPromptId: string, className?: string) => (
  <InterviewI18nProvider requestedLocale="en">
    <Prompts
      prompts={prompts}
      currentPromptId={currentPromptId}
      className={className}
    />
  </InterviewI18nProvider>
);

// The prompt shown, once it is the only one, and the way it came in.
const shownPrompt = async (id: string) => {
  await waitFor(() => {
    const shown = screen.getAllByTestId('prompt');
    expect(shown.map((prompt) => prompt.dataset.promptId)).toEqual([id]);
  });
  return screen.getByTestId('prompt').dataset.backwards;
};

describe('Prompts', () => {
  it('moves a prompt in from the side it was reached from, and keeps that until the prompt changes', async () => {
    const { rerender } = render(view('first'));
    expect(await shownPrompt('first')).toBe('false');

    rerender(view('third'));
    expect(await shownPrompt('third')).toBe('false');

    rerender(view('second'));
    expect(await shownPrompt('second')).toBe('true');

    // A render that changes nothing about the prompt keeps its direction.
    rerender(view('second', 'another-class'));
    expect(await shownPrompt('second')).toBe('true');

    rerender(view('third'));
    expect(await shownPrompt('third')).toBe('false');
  });
});
