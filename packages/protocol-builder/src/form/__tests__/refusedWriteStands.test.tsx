import { act, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { LocalizedInputField } from '../../fields/LocalizedStringField.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { useStageEditorForm } from '../stageEditorContext.ts';

const en = (text: string) => ({ 'en-US': text });

const fields: SectionDoc = {
  label: en('Welcome'),
  title: en('Welcome to the study'),
  items: [],
};

const REFUSAL = 'That row cannot be told apart from the one beside it.';

describe('a refusal reported while the stage can be written', () => {
  it('stands until the researcher acts again, however the editor re-renders', async () => {
    const held: { report?: (message: string) => void } = {};

    function Probe() {
      const { reportRefusedWrite } = useStageEditorForm();
      useLayoutEffect(() => {
        held.report = reportRefusedWrite;
      });
      return null;
    }

    const harness = renderStageEditor({
      stage: { type: 'Information', fields },
      sections: (
        <BuilderSection title="Page content">
          <Probe />
          <Field
            name="title"
            label="Page heading"
            component={LocalizedInputField}
          />
        </BuilderSection>
      ),
    });
    const heading = await screen.findByRole('textbox', {
      name: 'Page heading',
    });

    act(() => {
      held.report?.(REFUSAL);
    });
    expect(await screen.findByText(REFUSAL)).toBeInTheDocument();

    // Anything that re-renders the shell. The stage stays writable throughout,
    // so nothing has made the refusal stale.
    await harness.user.type(heading, '!');

    expect(screen.getByText(REFUSAL)).toBeInTheDocument();
  });
});
