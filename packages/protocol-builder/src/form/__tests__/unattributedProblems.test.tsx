import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

/**
 * A stage the protocol refuses at a key this mount has no control for.
 *
 * `title` is what an Information stage shows at the top of the page, and the
 * schema will not take an empty one. Nothing here edits it, so there is no
 * field to pin the refusal on and no section to send a researcher to.
 */
const untitledStage = {
  id: 'information-unowned',
  type: 'Information',
  fields: { label: 'Named', title: '', items: [] },
} as const;

describe('what the protocol refuses that no section answers for', () => {
  /**
   * Published rather than dropped.
   *
   * These used to end at a `continue`: an issue no mounted field reached was
   * left out of the sections and out of everything else, so the shortest
   * correct-looking host — one that renders the editor and a save button —
   * compiled, ran, and left Save doing nothing with no message anywhere on
   * screen. Where they are SHOWN is still the host's; that they exist to be
   * shown is the package's.
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
   * And a refusal a section DOES answer for is not published here as well.
   *
   * The two lists are one split, not two readings: a researcher told about the
   * same fault twice, once beside the section that answers for it and once in
   * a list of things nothing answers for, would go looking for a second
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
