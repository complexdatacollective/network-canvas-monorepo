import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The row renderers IntroScreen's DialogArrayField mounts, stubbed so this
// test covers the array plumbing only.
vi.mock('~/components/sections/ContentGrid/ItemEditor', () => ({
  default: () => <div data-testid="item-editor" />,
}));
vi.mock('~/components/sections/ContentGrid/ItemPreview', () => ({
  default: ({ content }: { content?: string }) => (
    <div data-testid="item-preview">{content}</div>
  ),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import IntroScreen from '../IntroScreen';

const renderSection = (committedStage: Record<string, unknown> = {}) =>
  renderStageForm({
    committedStage: asStage(committedStage),
    children: (
      <IntroScreen
        stagePath={null}
        stagePosition={0}
        interfaceType="FamilyPedigree"
      />
    ),
  });

describe('IntroScreen', () => {
  it('renders a toggle when introScreen is not set', () => {
    renderSection();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('section starts collapsed when introScreen is undefined', () => {
    renderSection();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('section starts expanded when introScreen has a value', () => {
    renderSection({ introScreen: { items: [] } });
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('shows the content-item list when enabled', () => {
    renderSection({ introScreen: { items: [] } });
    expect(
      screen.getByText(/No content sections have been created yet/),
    ).toBeInTheDocument();
  });

  it('hides the empty-state message and shows items when items exist', () => {
    renderSection({
      introScreen: { items: [{ id: 't1', type: 'text', content: 'Hello' }] },
    });
    expect(
      screen.queryByText(/No content sections have been created yet/),
    ).toBeNull();
    expect(screen.getByTestId('item-preview')).toHaveTextContent('Hello');
  });

  it('sets an empty items list when toggled on', () => {
    const view = renderSection();

    fireEvent.click(screen.getByRole('switch'));

    expect(view.getFormValues().introScreen).toEqual({ items: [] });
  });

  it('clears introScreen when toggled off', () => {
    const view = renderSection({ introScreen: { items: [] } });

    fireEvent.click(screen.getByRole('switch'));

    expect(view.getFormValues().introScreen).toBeUndefined();
  });

  // Regression: writing the whole-object container key (`introScreen`)
  // rather than the registered leaf (`introScreen.items`) is silently
  // inert — the array field's own dormant slot never gets touched, so a
  // toggle-off/toggle-on cycle would resurrect the previous session's items
  // instead of starting fresh.
  it('does not resurrect previous items after toggling off and back on', () => {
    const view = renderSection({
      introScreen: {
        items: [{ id: 't1', type: 'text', content: 'Hello' }],
      },
    });

    fireEvent.click(screen.getByRole('switch')); // off
    fireEvent.click(screen.getByRole('switch')); // on again

    expect(view.getFormValues().introScreen).toEqual({ items: [] });
    expect(screen.queryByTestId('item-preview')).toBeNull();
  });
});
