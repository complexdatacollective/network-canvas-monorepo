import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { fixtureMessage } from '../../testing/i18n.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';

const SORTING: SectionCapability = {
  fields: ['sortOptions'],
  confirmClear: {
    title: fixtureMessage('This will clear your sorting'),
    description: fixtureMessage(
      'The starting order and every sortable attribute will go.',
    ),
    confirmLabel: fixtureMessage('Clear sorting'),
  },
};

/**
 * The one reset a section may not ask for.
 *
 * A reset is written as commands, and a command addresses keys and never list
 * positions, so a path with an index in it is one no reset could carry. That is
 * a section describing itself wrongly — `resetOn` is documented as the path a
 * single field owns — and it is refused where the path is read rather than
 * dropped in silence, so the mistake shows up at the first reset instead of as
 * values disappearing for no stated reason.
 */
describe('a section resetting on a path a command cannot address', () => {
  function RowResetSections() {
    return (
      <>
        <BuilderSection title="Prompts">
          <Field
            name="prompts[0].text"
            label="Prompt text"
            component={InputField}
          />
        </BuilderSection>
        <BuilderSection
          title="Roster sorting"
          capability={SORTING}
          resetOn="prompts[0].text"
        >
          <Field
            name="sortOptions.sortOrder"
            label="Sort rule"
            component={InputField}
          />
        </BuilderSection>
      </>
    );
  }

  it('is refused rather than reset without its cause', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: <RowResetSections />,
    });
    const text = await screen.findByRole('textbox', { name: 'Prompt text' });

    await expect(harness.user.type(text, '!')).rejects.toThrow(
      /no command can address/,
    );
  });
});
