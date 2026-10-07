import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { selectIsFormDirty } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { LocalizedInputField } from '../../fields/LocalizedStringField.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import type { StageFormDraft } from '../../stageDocument.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import {
  type StageEditorFormContextValue,
  useStageEditorForm,
} from '../stageEditorContext.ts';

/**
 * A host change to the stored stage, carried into the editor that has it open.
 *
 * The rewrite here drops one language from every translation the stage holds,
 * which is the change Architect makes when a protocol language is removed; the
 * seam itself knows nothing about languages.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const withoutSpanish = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutSpanish);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'es')
      .map(([key, entry]) => [key, withoutSpanish(entry)]),
  );
};

const dropSpanish = (fields: StageFormDraft): StageFormDraft =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, withoutSpanish(value)]),
  );

const initialFields: SectionDoc = {
  label: { en: 'Welcome', es: 'Bienvenida' },
  title: { en: 'Welcome to the study', es: 'Bienvenida al estudio' },
  items: [],
};

function DirtyFlag() {
  const dirty = useFormStore(selectIsFormDirty);
  return <p data-testid="form-dirty">{dirty ? 'dirty' : 'clean'}</p>;
}

function renderEditor(readOnly = false) {
  const held: { form?: StageEditorFormContextValue } = {};

  function Probe() {
    held.form = useStageEditorForm();
    return null;
  }

  const harness = renderStageEditor({
    stage: { type: 'Information', fields: initialFields },
    localization: { defaultLocale: 'en', locales: ['en'] },
    ...(readOnly ? { readOnly: true } : {}),
    sections: (
      <BuilderSection title="Page content">
        <Probe />
        <Field
          name="title"
          label="Page heading"
          component={LocalizedInputField}
        />
        <DirtyFlag />
      </BuilderSection>
    ),
  });

  const form = (): StageEditorFormContextValue => {
    if (held.form === undefined) {
      throw new Error('nothing mounted the probe, so there is no form to read');
    }
    return held.form;
  };

  return {
    harness,
    form,
    mapDocuments: (rewrite: (fields: StageFormDraft) => StageFormDraft) => {
      act(() => {
        form().mapDocuments(rewrite);
      });
    },
  };
}

const heading = () => screen.getByRole('textbox', { name: 'Page heading' });
const dirtyFlag = () => screen.getByTestId('form-dirty');

describe('a host change carried into the open stage', () => {
  it('leaves a draft with nothing unsaved with nothing unsaved', async () => {
    const { form, mapDocuments } = renderEditor();
    await screen.findByRole('textbox', { name: 'Page heading' });

    mapDocuments(dropSpanish);

    expect(form().liveDraft().title).toEqual({ en: 'Welcome to the study' });
    expect(form().liveDraft().label).toEqual({ en: 'Welcome' });
    expect(form().committedFields.title).toEqual({
      en: 'Welcome to the study',
    });
    expect(form().savedFields.title).toEqual({ en: 'Welcome to the study' });
    // The control and its baseline moved together, so the form has nothing
    // to ask the researcher about.
    expect(dirtyFlag()).toHaveTextContent('clean');
  });

  it('keeps an edit the researcher has not saved, rewritten', async () => {
    const { harness, form, mapDocuments } = renderEditor();
    const control = await screen.findByRole('textbox', {
      name: 'Page heading',
    });
    await harness.user.clear(control);
    await harness.user.type(control, 'Half-written heading');

    mapDocuments(dropSpanish);

    expect(heading()).toHaveValue('Half-written heading');
    expect(form().liveDraft().title).toEqual({ en: 'Half-written heading' });
    expect(dirtyFlag()).toHaveTextContent('dirty');

    const written = await harness.submit();
    expect(written?.stageDocument.title).toEqual({
      en: 'Half-written heading',
    });
    expect(written?.stageDocument.label).toEqual({ en: 'Welcome' });
  });

  it('rewrites what a structural write put where no control is', async () => {
    const { harness, form, mapDocuments } = renderEditor();
    await screen.findByRole('textbox', { name: 'Page heading' });
    act(() => {
      form().applyOwnCommands([
        {
          op: 'set',
          key: 'items',
          value: [
            {
              id: 'a',
              type: 'text',
              content: { en: 'Who?', es: '¿Quién?' },
            },
          ],
        },
      ]);
    });

    mapDocuments(dropSpanish);

    const written = await harness.submit();
    expect(written?.stageDocument.items).toEqual([
      { id: 'a', type: 'text', content: { en: 'Who?' } },
    ]);
    expect(written?.stageDocument.title).toEqual({
      en: 'Welcome to the study',
    });
  });

  it('carries the change while somebody else holds the stage', async () => {
    const { form, mapDocuments } = renderEditor(true);
    await screen.findByRole('textbox', { name: 'Page heading' });

    mapDocuments(dropSpanish);

    // Nothing is written that the protocol does not already hold, so there is
    // no refusal to make.
    expect(form().liveDraft().title).toEqual({ en: 'Welcome to the study' });
    expect(screen.queryByText(/your change was not made/)).toBeNull();
    await waitFor(() => expect(dirtyFlag()).toHaveTextContent('clean'));
  });
});
