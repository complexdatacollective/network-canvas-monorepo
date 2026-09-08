import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';

import BuilderSection from '../../sections/BuilderSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';

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
            <ProtocolField
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
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: (
        <>
          <StageNameSection />
          <BuilderSection title="Introduction panel">
            <ProtocolField
              name="introductionPanel.title"
              label="Panel heading"
              component={InputField}
            />
            <ProtocolField
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

    const { fields } = harness.session.getSnapshot().editedSection;
    expect(Object.hasOwn(fields, 'introductionPanel')).toBe(false);
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
            <ProtocolField
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
    // The submit never ran, so nothing was written — least of all the removal
    // that emptying an OPTIONAL field earns.
    expect(harness.session.getSnapshot().editedSection.fields.title).toBe(
      'Welcome',
    );
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
            <ProtocolField
              name="title"
              label="Page heading"
              component={InputField}
            />
          </BuilderSection>
        </>
      ),
    });

    await harness.user.clear(
      await harness.findByRole('textbox', { name: 'Page heading' }),
    );

    // Dropping an empty value must not turn a key the schema requires into a
    // key nobody notices is gone.
    expect(await harness.submit()).toBeNull();
    const { validation } = harness.session.getSnapshot();
    expect(validation.status).toBe('invalid');
    expect(
      validation.status === 'invalid' &&
        validation.issues.some((issue) => issue.path.at(-1) === 'title'),
    ).toBe(true);
  });
});
