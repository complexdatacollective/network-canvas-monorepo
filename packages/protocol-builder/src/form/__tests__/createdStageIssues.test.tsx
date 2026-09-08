import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import BuilderSection from '../../sections/BuilderSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';

/**
 * A page heading the schema refuses and no control can object to.
 *
 * The class of problem the outline's session issues exist for: every control
 * is holding a value it is perfectly happy with, and only the protocol schema
 * has anything to say about it. A stage arrives holding one when an import, a
 * migration or a collaborator's change leaves a key of the wrong type behind.
 */
const REFUSED_TITLE: SectionDoc = {
  label: 'New page',
  title: 42,
  items: [],
};

const pageContent = (
  <>
    <StageNameSection />
    <BuilderSection title="Page content">
      <ProtocolField name="title" label="Page heading" component={InputField} />
    </BuilderSection>
  </>
);

/**
 * The whole state the outline speaks, sentence included: nothing on the page
 * can explain a schema refusal about a value every control is happy with, so
 * the outline is where it is written down. Asserting the status word alone
 * would pass on a section that had gone red for some other reason.
 */
const PROBLEM_OUTLINE = [
  { title: 'Stage name', state: 'Finished' },
  {
    title: 'Page content',
    state: 'Has a problem. Page heading holds the wrong kind of value.',
  },
];

/**
 * A stage the interview does not contain yet is judged where it is about to
 * live: the host puts the draft into the stage order at its insertion position
 * before validating it, so every `stages[n]` the validator answers with is
 * numbered against an order the protocol itself does not hold. Read against
 * the authoritative order instead, a created stage's problems belonged to the
 * existing stage at that index, or — for one being appended — to no section at
 * all, and the outline dropped them: every section read "Finished" while the
 * save refused the stage.
 */
describe('a stage being created', () => {
  it('shows its problem on the section that owns it', async () => {
    const harness = renderStageEditor({
      create: { type: 'Information', position: 1, fields: REFUSED_TITLE },
      sections: pageContent,
    });

    await harness.findByRole('textbox', { name: 'Page heading' });
    await waitFor(() => expect(harness.outline()).toEqual(PROBLEM_OUTLINE));
  });

  it('is the stage blamed, not the one it is being inserted before', async () => {
    const harness = renderStageEditor({
      create: { type: 'Information', position: 1, fields: REFUSED_TITLE },
      sections: pageContent,
    });

    await harness.findByRole('textbox', { name: 'Page heading' });
    await waitFor(() => {
      const { validation } = harness.session.getSnapshot();
      expect(validation.status).toBe('invalid');
      // `ego-form-1` is the fixture's stage at index 1, and it is a stage this
      // editor has never touched.
      expect(
        validation.status === 'invalid' &&
          validation.issues.map((issue) => issue.sectionId),
      ).toEqual([sectionId({ kind: 'stage', stageId: harness.seeded.id })]);
    });
  });

  it('shows its problem when it is being appended to the end', async () => {
    const harness = renderStageEditor({
      // Past every stage the fixture holds, which is where a host adding a
      // stage to the end of the interview puts it.
      create: { type: 'Information', position: 99, fields: REFUSED_TITLE },
      sections: pageContent,
    });

    await harness.findByRole('textbox', { name: 'Page heading' });
    await waitFor(() => expect(harness.outline()).toEqual(PROBLEM_OUTLINE));
  });

  /**
   * The control. An EXISTING stage is listed in the authoritative order, so
   * its issues were attributed correctly all along — and an attribution that
   * simply stopped reading that order would pass the three above while
   * breaking this.
   */
  it('is still read from the stage order when the stage exists', async () => {
    const harness = renderStageEditor({
      stage: { type: 'Information', fields: REFUSED_TITLE },
      sections: pageContent,
    });

    await harness.findByRole('textbox', { name: 'Page heading' });
    await waitFor(() => expect(harness.outline()).toEqual(PROBLEM_OUTLINE));
  });
});
