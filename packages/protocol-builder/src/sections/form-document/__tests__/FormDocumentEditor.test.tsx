import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { withMod } from '@codaco/fresco-ui/testing/modKey';
import {
  dynamicAttributesContextOf,
  dynamicValueNameFor,
  type LocaleTag,
  fieldBlockMarkdown,
} from '@codaco/protocol-validation';

import type { DynamicMessageSite } from '../../../fields/dynamicText/messageSite.ts';
import type { ProtocolLocalization } from '../../../localization/localizedText.ts';
import type { FieldText } from '../../../localization/messageDocument.ts';
import { ProtocolLocalizationProvider } from '../../../localization/ProtocolLocalization.tsx';
import { testVariableId } from '../../../testing/testId.ts';
import {
  type FormDocumentEditing,
  FormDocumentEditor,
} from '../FormDocumentEditor.tsx';
import type { FormFieldDraft } from '../formDocumentValue.ts';

const LOCALIZATION: ProtocolLocalization = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

const AGE = testVariableId('age');
const TOWN = testVariableId('town');
const VARIABLES = {
  [AGE]: { name: 'age', type: 'number' as const },
  [TOWN]: { name: 'town', type: 'text' as const },
};
const AGE_PILL = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: AGE,
});

const FIELDS: readonly FormFieldDraft[] = [
  {
    id: 'age-field',
    variable: AGE,
    prompt: { en: 'How old are you?', es: '¿Cuántos años tienes?' },
    hint: { en: 'In years' },
  },
  {
    id: 'town-field',
    variable: TOWN,
    prompt: { en: 'Where do you live?', es: '¿Dónde vives?' },
  },
];

/** A form with text, a pill and two fields. */
const FORM = [
  `You are {${AGE_PILL}}.`,
  fieldBlockMarkdown('age-field'),
  'Then:',
  fieldBlockMarkdown('town-field'),
].join('\n\n');

const SITE: DynamicMessageSite = {
  context: {
    roles: new Set(['ego']),
    variablesFor: (role) => (role === 'ego' ? VARIABLES : undefined),
    dynamicAttributes: dynamicAttributesContextOf({}),
  },
};

const stageEditing = (
  onFieldTextsChange: (fieldTexts: ReadonlyMap<string, FieldText>) => void,
): FormDocumentEditing => ({
  kind: 'stage',
  onFieldTextsChange,
  subject: { entity: 'ego' },
  protocolContext: {
    codebook: { ego: { variables: VARIABLES } },
    assets: {},
    orderedStages: [],
    issues: [],
  },
  stageId: 'stage',
  rules: {
    draftUnvalidated: new Set(),
    draftUnvalidatedReason: undefined,
    reserved: new Set(),
    reservedReason: undefined,
    reservedRefusal: undefined,
    answeredFor: undefined,
  },
  writes: {
    setControl: vi.fn(),
    setOptionsAndSettings: vi.fn(),
    createAttribute: vi.fn(),
  },
  onFieldStarted: vi.fn(),
});

const renderEditor = ({
  editing,
  message,
  locale,
}: Readonly<{
  editing: FormDocumentEditing;
  message: string;
  locale: LocaleTag;
}>) => {
  const onMessageChange = vi.fn<(message: string | undefined) => void>();
  const view = render(
    <ProtocolLocalizationProvider
      localization={LOCALIZATION}
      initialLocale={locale}
    >
      <DialogProvider>
        <FormDocumentEditor
          id="form"
          name="form"
          ariaDescribedBy=""
          ariaLabelledBy={undefined}
          ariaInvalid={false}
          ariaRequired={false}
          editable
          message={message}
          onMessageChange={onMessageChange}
          content={{ [locale]: message }}
          fields={FIELDS}
          locale={locale}
          localization={LOCALIZATION}
          interfaceText={undefined}
          site={SITE}
          showsProblems={false}
          variables={VARIABLES}
          editing={editing}
        />
      </DialogProvider>
    </ProtocolLocalizationProvider>,
  );
  return { ...view, onMessageChange };
};

const formEditor = () => screen.findByRole('textbox', { name: 'form' });

/** Selects the whole form and copies it, as Mod-A and Mod-C do. */
const copyAll = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await formEditor());
  await user.keyboard(withMod('a'));
  const clipboard = await user.copy();
  if (clipboard === undefined) throw new Error('Nothing was copied.');
  return clipboard;
};

describe('a form copied between a stage editor and the translation table', () => {
  it('keeps its text, pills and fields when copied from a stage editor into a cell of the table', async () => {
    const user = userEvent.setup();
    const stage = renderEditor({
      editing: stageEditing(vi.fn()),
      message: FORM,
      locale: 'en',
    });
    const copied = await copyAll(user);
    stage.unmount();

    const cell = renderEditor({
      editing: { kind: 'translation' },
      message: '',
      locale: 'es',
    });
    const editor = await formEditor();
    await user.click(editor);
    await user.paste(copied);

    await waitFor(() => {
      expect(cell.onMessageChange).toHaveBeenLastCalledWith(FORM);
    });
    // The cell's blocks contain no text: the fields' questions are rows of
    // their own.
    expect(editor.querySelectorAll('[data-field-id]')).toHaveLength(2);
    expect(editor.querySelector('[data-field-label]')).toBe(null);
  });

  it('keeps its text, pills and fields when copied from a cell of the table into a stage editor, whose fields take their questions in its language', async () => {
    const user = userEvent.setup();
    const cell = renderEditor({
      editing: { kind: 'translation' },
      message: FORM,
      locale: 'en',
    });
    const copied = await copyAll(user);
    cell.unmount();

    const onFieldTextsChange =
      vi.fn<(fieldTexts: ReadonlyMap<string, FieldText>) => void>();
    const stage = renderEditor({
      editing: stageEditing(onFieldTextsChange),
      message: '',
      locale: 'es',
    });
    await user.click(await formEditor());
    await user.paste(copied);

    await waitFor(() => {
      expect(stage.onMessageChange).toHaveBeenLastCalledWith(FORM);
    });
    const fieldTexts = onFieldTextsChange.mock.lastCall?.[0];
    expect(fieldTexts?.get('age-field')).toEqual({
      variable: AGE,
      showValidationHints: false,
      prompt: '¿Cuántos años tienes?',
    });
    expect(fieldTexts?.get('town-field')).toEqual({
      variable: TOWN,
      showValidationHints: false,
      prompt: '¿Dónde vives?',
    });
  });
});
