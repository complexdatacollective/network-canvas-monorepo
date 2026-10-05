import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../renderStageEditor.tsx';

/**
 * Two sections owning two different keys, so each harness can be asked about
 * something only it holds. Written out rather than taken from the shared
 * sections, which are toggleable and register nothing until they are switched
 * on — an empty answer would agree with both halves of every contrast below.
 */
const pageContent = (
  <BuilderSection title="Page content">
    <Field name="title" label="Page heading" component={InputField} />
  </BuilderSection>
);
const guidance = (
  <BuilderSection title="Interviewer guidance">
    <Field
      name="interviewScript"
      label="Interviewer script text"
      component={InputField}
    />
  </BuilderSection>
);

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
      sections: pageContent,
    });
    const second = renderStageEditor({
      stageId: 'information-1',
      sections: guidance,
    });

    expect(second.formId).not.toBe(first.formId);
    // Two forms, two ids: the id is the whole contract for a submit control
    // the host renders outside the form, so a shared one leaves the second
    // harness's save button submitting the first harness's form.
    expect(document.querySelectorAll(`#${first.formId}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${second.formId}`)).toHaveLength(1);
  });

  it('answers `ownedKeys` about its own form', () => {
    const withPageContent = renderStageEditor({
      stageId: 'information-1',
      sections: pageContent,
    });
    const withGuidance = renderStageEditor({
      stageId: 'information-1',
      sections: guidance,
    });

    expect(withPageContent.ownedKeys()).toContain('title');
    expect(withGuidance.ownedKeys()).not.toContain('title');
  });

  it('answers `outline` about its own sections', () => {
    const withPageContent = renderStageEditor({
      stageId: 'information-1',
      sections: pageContent,
    });
    const withGuidance = renderStageEditor({
      stageId: 'information-1',
      sections: guidance,
    });

    expect(withPageContent.outline().map((entry) => entry.title)).toContain(
      'Page content',
    );
    expect(withGuidance.outline().map((entry) => entry.title)).not.toContain(
      'Page content',
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
      sections: <></>,
    });
    const second = renderStageEditor({
      stageId: 'ego-form-1',
      sections: <></>,
    });

    expect((await second.submit())?.stageDocument.id).toBe('ego-form-1');
    expect((await first.submit())?.stageDocument.id).toBe('information-1');
  });
});
