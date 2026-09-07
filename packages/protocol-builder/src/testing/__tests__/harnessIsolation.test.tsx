import { describe, expect, it } from 'vitest';

import InterviewerGuidanceSection from '../../sections/InterviewerGuidanceSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import { renderStageEditor } from '../renderStageEditor.tsx';

/**
 * A test may mount two harnesses — comparing two interfaces, or an editor
 * against the sections it is built from — and each has to answer about itself.
 *
 * Every reader the harness offers used to read the DOCUMENT: `ownedKeys()`
 * found the form by `document.getElementById('stage-form')`, `outline()` and
 * the submit control came off the global `screen`, and a refusal was looked for
 * anywhere under `baseElement`. Each of those answers with whichever harness
 * the document holds first, so the second harness reported the first one's
 * fields, the first one's sections and the first one's problems as its own —
 * and a test comparing the two compared one of them with itself.
 */
describe('two harnesses mounted in one test', () => {
  it('gives each its own form id', () => {
    const first = renderStageEditor({
      stageId: 'information-1',
      sections: <StageNameSection />,
    });
    const second = renderStageEditor({
      stageId: 'information-1',
      sections: <InterviewerGuidanceSection />,
    });

    expect(second.formId).not.toBe(first.formId);
    // Two forms, two ids: the id is the whole contract for a submit control
    // the host renders outside the form, so a shared one leaves the second
    // harness's save button submitting the first harness's form.
    expect(document.querySelectorAll(`#${first.formId}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${second.formId}`)).toHaveLength(1);
  });

  it('answers `ownedKeys` about its own form', () => {
    const withName = renderStageEditor({
      stageId: 'information-1',
      sections: <StageNameSection />,
    });
    const withoutName = renderStageEditor({
      stageId: 'information-1',
      sections: <InterviewerGuidanceSection />,
    });

    expect(withName.ownedKeys()).toContain('label');
    expect(withoutName.ownedKeys()).not.toContain('label');
  });

  it('answers `outline` about its own sections', () => {
    const withName = renderStageEditor({
      stageId: 'information-1',
      sections: <StageNameSection />,
    });
    const withoutName = renderStageEditor({
      stageId: 'information-1',
      sections: <InterviewerGuidanceSection />,
    });

    expect(withName.outline().map((entry) => entry.title)).toContain(
      'Stage name',
    );
    expect(withoutName.outline().map((entry) => entry.title)).not.toContain(
      'Stage name',
    );
  });

  /**
   * And the save control, which is the one reader a wrong answer would use to
   * act on the other harness rather than merely to report about it: a click on
   * the first harness's button saves the first harness's stage, while the test
   * is asking the second to save.
   */
  it('saves its own stage', async () => {
    const first = renderStageEditor({
      stageId: 'information-1',
      sections: <StageNameSection />,
    });
    const second = renderStageEditor({
      stageId: 'ego-form-1',
      sections: <StageNameSection />,
    });

    expect((await second.submit())?.stageDocument.id).toBe('ego-form-1');
    expect((await first.submit())?.stageDocument.id).toBe('information-1');
  });
});
