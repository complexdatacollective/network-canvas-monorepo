import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import SkipLogicSection from '../../sections/SkipLogicSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import { fixtureStageIds, loadFixtureStage } from '../protocolFixture.ts';
import { renderStageEditor } from '../renderStageEditor.tsx';

const commonSections = (
  <>
    <StageNameSection />
    <SkipLogicSection />
    <InterviewerGuidanceSection />
  </>
);

describe('the stage-editor test harness', () => {
  it('opens a stage of the shared protocol over a real session', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: commonSections,
    });

    expect(harness.seeded.type).toBe('Information');
    expect(harness.session.getSnapshot().editedSection.fields).toMatchObject({
      title: expect.any(String) as unknown as string,
    });
    expect(screen.getByRole('button', { name: 'Save stage' })).toBeEnabled();
  });

  it('refuses a stage the shared protocol does not contain', () => {
    expect(() => loadFixtureStage('not-a-stage')).toThrow(
      /has no stage "not-a-stage"/,
    );
    expect(fixtureStageIds()).toContain('information-1');
  });

  it('lists the mounted sections, in order, with their states', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: commonSections,
    });

    await expect
      .poll(() => harness.outline().map((section) => section.title))
      .toEqual(['Stage name', 'Skip logic', 'Interviewer guidance']);
    expect(harness.outline().map((section) => section.state)).toEqual([
      'Finished',
      'Switched off',
      'Switched off',
    ]);
  });

  /**
   * The whole point of seeding from the shared protocol: an editor that has no
   * section for one of its interface's keys must not be able to lose it.
   */
  it('round-trips a stage nothing has edited', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: commonSections,
    });

    const request = await harness.roundTrip();

    expect(Object.keys(request.stageDocument).toSorted()).toEqual(
      ['id', 'type', 'label', 'subject', 'form', 'prompts'].toSorted(),
    );
  });

  it('reports a save the editor refused rather than waiting for one', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'Information',
        fields: { label: '', title: '', items: [] },
      },
      sections: commonSections,
    });

    expect(await harness.submit()).toBeNull();
  });

  it('hands editing away and takes it back', async () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      sections: commonSections,
    });

    harness.setReadOnly();
    expect(harness.session.getSnapshot().access.mode).toBe('readOnly');
    expect(await harness.submit()).toBeNull();

    harness.setReadOnly(false);
    expect(harness.session.getSnapshot().access.mode).toBe('editable');
  });
});
