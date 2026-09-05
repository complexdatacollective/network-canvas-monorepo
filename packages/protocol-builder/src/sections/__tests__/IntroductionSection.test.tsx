import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import IntroductionSection from '../IntroductionSection.tsx';
import StageNameSection from '../StageNameSection.tsx';

const introduction = (
  <>
    <StageNameSection />
    <IntroductionSection />
  </>
);

describe('the introduction a participant reads before a task', () => {
  it('shows both halves of what the stage holds', async () => {
    renderStageEditor({
      stageId: 'alter-edge-form-1',
      sections: introduction,
    });

    expect(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    ).toHaveValue('Introduction to the alter edge form');
    expect(
      await screen.findByRole('textbox', { name: 'Introduction text' }),
    ).toHaveTextContent('A few questions about each relationship.');
  });

  it('reports itself finished, and saves the stage unchanged', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: introduction,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline()[1]).toEqual({
      title: 'Task introduction',
      state: 'Finished',
    });

    // An ego form's `form` is the family's own section.
    await harness.roundTrip({ unowned: ['form'] });
  });

  /**
   * Not a capability: every interface with an introduction requires one, so
   * there is nothing to switch off and no state in which half of it is
   * acceptable.
   */
  it('offers no way to switch the introduction off', () => {
    renderStageEditor({ stageId: 'ego-form-1', sections: introduction });

    expect(
      screen.queryByRole('switch', { name: 'Task introduction' }),
    ).not.toBeInTheDocument();
  });

  it('refuses to save a stage whose introduction has no heading', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: introduction,
    });

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    );
    await waitFor(() =>
      expect(harness.outline()[1]?.state).toBe('Not finished'),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
  });

  /**
   * The two fields are the halves of one schema object, and a section owning
   * part of a nested value has to render every part of it — otherwise the half
   * it does not render is written back over on save.
   */
  it('keeps the half it is not editing when the other changes', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: introduction,
    });
    const before = harness.seeded.fields.introductionPanel;

    const heading = screen.getByRole('textbox', {
      name: 'Introduction heading',
    });
    await harness.user.clear(heading);
    await harness.user.type(heading, 'About you');

    const request = await harness.submit();
    expect(request?.stageDocument.introductionPanel).toEqual({
      title: 'About you',
      text: Reflect.get(before as object, 'text') as string,
    });
  });
});

/**
 * The introduction's heading is a HEADING, shown at the top of a screen the
 * participant reads — not a label of unbounded length. Left uncapped, a
 * researcher can type a paragraph into it and only find out it does not fit
 * when they run the interview.
 */
describe('the length of an introduction heading', () => {
  it('stops the researcher at the length the screen can show', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: introduction,
    });

    const heading = screen.getByRole('textbox', {
      name: 'Introduction heading',
    });
    await harness.user.clear(heading);
    await harness.user.type(heading, 'A'.repeat(60));

    // Refused rather than silently truncated: the researcher wrote something
    // and gets to decide what to cut.
    expect(await harness.submit()).toBeNull();
    expect(await screen.findByText(/Too long/)).toBeInTheDocument();
    expect(heading).toHaveValue('A'.repeat(60));
  });

  it('accepts a heading of exactly that length', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: introduction,
    });

    const heading = screen.getByRole('textbox', {
      name: 'Introduction heading',
    });
    await harness.user.clear(heading);
    await harness.user.type(heading, 'A'.repeat(50));

    const request = await harness.submit();
    expect(
      Reflect.get(request?.stageDocument.introductionPanel as object, 'title'),
    ).toBe('A'.repeat(50));
  });
});
