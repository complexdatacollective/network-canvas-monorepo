import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import BuilderSection from '../../sections/BuilderSection.tsx';
import StageNameSection from '../../sections/stage-heading/StageNameSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { createStageDraftProbe } from './stageDraftProbe.tsx';

/**
 * What a control that has been emptied leaves in the stage.
 *
 * Driven through real fresco-ui text inputs and the harness's own submit,
 * because the spelling under test is one the form produces rather than one a
 * caller could choose: a cleared `InputField` submits `''`, and a group of
 * cleared inputs assembles an object holding nothing but empty strings.
 * Neither is a value the protocol schema accepts where it accepts a value at
 * all, and neither is something the researcher wrote.
 */
describe('a control the researcher emptied', () => {
  it('leaves nothing in the stage', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'Information',
        fields: {
          label: 'Information',
          title: 'Welcome',
          items: [{ id: 'info-item-1', type: 'text', content: 'Hello.' }],
          interviewScript: 'Read this aloud',
        },
      },
      sections: (
        <>
          <StageNameSection />
          <BuilderSection title="Interviewer guidance">
            <Field
              name="interviewScript"
              label="Interviewer script text"
              component={InputField}
            />
          </BuilderSection>
        </>
      ),
    });

    const script = await harness.findByRole('textbox', {
      name: 'Interviewer script text',
    });
    await harness.user.clear(script);

    const request = await harness.submit();

    // Not `interviewScript: ''`, which is content in the researcher's protocol
    // that the researcher did not write.
    expect(request).not.toBeNull();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'interviewScript')).toBe(
      false,
    );
  });

  it('takes the container it emptied with it', async () => {
    const { probe, draft } = createStageDraftProbe();
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: (
        <>
          <StageNameSection />
          <BuilderSection title="Introduction panel">
            {probe}
            <Field
              name="introductionPanel.title"
              label="Panel heading"
              component={InputField}
            />
            <Field
              name="introductionPanel.text"
              label="Panel text"
              component={InputField}
            />
          </BuilderSection>
        </>
      ),
    });

    await harness.user.clear(
      await harness.findByRole('textbox', { name: 'Panel heading' }),
    );
    await harness.user.clear(
      await harness.findByRole('textbox', { name: 'Panel text' }),
    );

    // The panel is required, so this save is refused either way. What is under
    // test is what the draft holds after it: an `introductionPanel` of two
    // empty strings is a panel the researcher did not write, and the schema
    // reports it as two values that are too short rather than as the panel
    // simply not being there.
    expect(await harness.submit()).toBeNull();

    expect(Object.hasOwn(draft(), 'introductionPanel')).toBe(false);
  });

  it('is refused rather than dropped when the field is required', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'Information',
        fields: {
          label: 'Information',
          title: 'Welcome',
          items: [{ id: 'info-item-1', type: 'text', content: 'Hello.' }],
        },
      },
      sections: (
        <>
          <StageNameSection />
          <BuilderSection title="Page content">
            <Field
              name="title"
              label="Page heading"
              component={InputField}
              required
            />
          </BuilderSection>
        </>
      ),
    });

    const title = await harness.findByRole('textbox', { name: 'Page heading' });
    await harness.user.clear(title);

    expect(await harness.submit()).toBeNull();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    // The submit never ran, so nothing reached the protocol — least of all the
    // removal that emptying an OPTIONAL field earns.
    expect(
      harness.protocolSections()[
        sectionId({ kind: 'stage', stageId: harness.seeded.id })
      ],
    ).toEqual({
      id: harness.seeded.id,
      type: 'Information',
      ...harness.seeded.fields,
    });
  });

  it('is reported missing by the schema when nothing on screen requires it', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'Information',
        fields: {
          label: 'Information',
          title: 'Welcome',
          items: [{ id: 'info-item-1', type: 'text', content: 'Hello.' }],
        },
      },
      sections: (
        <>
          <StageNameSection />
          <BuilderSection title="Page content">
            <Field name="title" label="Page heading" component={InputField} />
          </BuilderSection>
        </>
      ),
    });

    await harness.user.clear(
      await harness.findByRole('textbox', { name: 'Page heading' }),
    );

    // Dropping an empty value must not turn a key the schema requires into a
    // key nobody notices is gone: no control on the page asks for it, so the
    // section beside it is the only place the researcher is told.
    expect(await harness.submit()).toBeNull();
    expect(harness.outline()).toContainEqual({
      title: 'Page content',
      state:
        'Has a problem. Page heading has no value, and this stage needs one.',
    });
  });
});
