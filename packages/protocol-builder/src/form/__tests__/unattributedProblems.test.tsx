import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

/**
 * A stage the protocol refuses at a key this mount has no control for: the
 * schema will not take an Information stage with an empty `title`, and nothing
 * here edits it.
 */
const untitledStage = {
  id: 'information-unowned',
  type: 'Information',
  fields: { label: 'Named', title: '', items: [] },
} as const;

describe('what the protocol refuses that no section answers for', () => {
  /**
   * Published rather than dropped. These used to end at a `continue`, so the
   * shortest correct-looking host compiled, ran, and left Save doing nothing
   * with no message anywhere on screen.
   */
  it('is published to the host beside the sections', async () => {
    const harness = renderStageEditor({
      stage: untitledStage,
      sections: <></>,
    });

    expect(await harness.submit()).toBeNull();
    expect(harness.problems()).toEqual([
      'A setting this editor does not show has no value, and this stage needs one.',
    ]);
  });

  /**
   * And a refusal a section DOES answer for is not published here as well: a
   * researcher told about one fault twice would go looking for a second
   * problem that does not exist.
   */
  it('is not published when a mounted section answers for it', async () => {
    const harness = renderStageEditor({
      stage: untitledStage,
      sections: (
        <BuilderSection title="Page content">
          <Field name="title" label="Page heading" component={InputField} />
        </BuilderSection>
      ),
    });

    expect(await harness.submit()).toBeNull();
    expect(harness.problems()).toEqual([]);
    expect(harness.outline()).toEqual([
      {
        title: 'Page content',
        state:
          'Has a problem. Page heading has no value, and this stage needs one.',
      },
    ]);
  });
});
