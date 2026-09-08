import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';

/**
 * Two faults of different kinds in one section.
 *
 * `title` holds a number, which the protocol schema refuses and no control on
 * the page can object to — the only place it is written down is the outline.
 * `label` is empty, which the required control beside it says for itself.
 */
const REFUSED_TITLE_AND_EMPTY_NAME: SectionDoc = {
  label: '',
  title: 42,
  items: [],
};

const pageContent = (
  <>
    <BuilderSection title="Page content">
      <ProtocolField
        name="label"
        label="Stage name"
        component={InputField}
        required
      />
      <ProtocolField name="title" label="Page heading" component={InputField} />
    </BuilderSection>
  </>
);

/**
 * A section can be wrong in two ways at once, and only one of them has a
 * control that says so. A screen-reader user who hears "Has a problem" and
 * finds the empty control has found the problem the page could already show
 * them; the refusal about the heading is the one nothing else on the page can
 * explain, and it is the one that disappeared.
 */
describe('a section with a field error and a session problem', () => {
  it('still reads out the problem no control can explain', async () => {
    const harness = renderStageEditor({
      stage: { type: 'Information', fields: REFUSED_TITLE_AND_EMPTY_NAME },
      sections: pageContent,
    });

    // The required control only says anything once a save has been asked for,
    // which is also what puts the two kinds of fault on screen together.
    expect(await harness.submit()).toBeNull();

    await waitFor(() =>
      expect(harness.outline()).toEqual([
        {
          title: 'Page content',
          state: 'Has a problem. Page heading holds the wrong kind of value.',
        },
      ]),
    );
  });

  /**
   * The control. A sentence the control that answers for it is ALREADY saying
   * beside itself is two accounts of one fault, and the outline says the state
   * alone — which is what the blanket suppression was reaching for.
   */
  it('does not repeat a problem the control that owns it is showing', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'Information',
        fields: {
          label: 'New page',
          title: 'Welcome',
          // The item names a resource the protocol does not hold, which the
          // session refuses at the very path this control is registered at —
          // so the control reporting a rule of its own is also the control the
          // session's sentence is attributed to.
          items: [{ id: 'item-1', type: 'asset', content: 'ab' }],
        },
      },
      sections: (
        <BuilderSection title="Page content">
          <ProtocolField
            name="items[0].content"
            nameMode="path"
            label="First item"
            component={InputField}
            minLength={3}
          />
        </BuilderSection>
      ),
    });

    expect(await harness.submit()).toBeNull();

    await waitFor(() =>
      expect(harness.outline()).toEqual([
        { title: 'Page content', state: 'Has a problem' },
      ]),
    );
  });
});
