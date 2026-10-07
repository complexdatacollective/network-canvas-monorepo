import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  escapeMessageText,
  getLocaleMetadata,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolLocalization } from '../../../localization/localizedText.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  mountedAs,
  stageNameInput,
} from '../../__tests__/formEditorHarness.tsx';
import { languageChooserStageEditor } from '../LanguageChooserStageEditor.ts';

/** See `editors/__tests__/formEditorHarness.tsx` for why the stand-in. */
vi.mock('../../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

/** The all-interfaces fixture is written in this one language. */
const FIXTURE_LANGUAGE = 'en-US';

// Declared out of alphabetical order, which the list does not follow.
const THREE_LANGUAGES: ProtocolLocalization = {
  defaultLocale: FIXTURE_LANGUAGE,
  locales: ['ar', FIXTURE_LANGUAGE, 'fr'],
};

const ENGLISH_AND_FRENCH: ProtocolLocalization = {
  defaultLocale: FIXTURE_LANGUAGE,
  locales: [FIXTURE_LANGUAGE, 'fr'],
};

const openStage = (fields: SectionDoc = {}) => ({
  stage: {
    type: 'LanguageChooser' as const,
    fields: { label: { [FIXTURE_LANGUAGE]: 'Choose a language' }, ...fields },
  },
  editor: mountedAs(languageChooserStageEditor.LanguageChooser),
});

describe('the editor for the stage where a participant chooses a language', () => {
  it('lists the protocol languages alphabetically by their own names, without letting the stage change them', () => {
    renderStageEditor({ ...openStage(), localization: THREE_LANGUAGES });

    const list = screen.getByRole('list', {
      name: 'Languages participants can choose',
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      `${getLocaleMetadata(FIXTURE_LANGUAGE).label}Default`,
      'français',
      'العربية',
    ]);
    const arabic = within(list).getByText('العربية');
    expect(arabic).toHaveAttribute('lang', 'ar');
    expect(arabic).toHaveAttribute('dir', 'rtl');

    expect(within(list).queryAllByRole('textbox')).toEqual([]);
    expect(within(list).queryAllByRole('checkbox')).toEqual([]);
    expect(
      screen.queryByText(/written in one language/),
    ).not.toBeInTheDocument();
  });

  it('says a protocol in one language offers participants a single choice', () => {
    renderStageEditor(openStage());

    expect(
      within(
        screen.getByRole('list', { name: 'Languages participants can choose' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(
      screen.getByText(
        'This protocol is written in one language, so participants will see it as their only choice.',
      ),
    ).toBeInTheDocument();
  });

  it('saves a stage it opened unchanged', async () => {
    const harness = renderStageEditor({
      ...openStage({ interviewScript: 'Help the participant choose.' }),
      localization: ENGLISH_AND_FRENCH,
    });

    await harness.roundTrip();
  });

  it('saves a new stage with nothing but the name it proposes', async () => {
    const harness = renderStageEditor({
      create: { type: 'LanguageChooser', position: 0 },
      editor: mountedAs(languageChooserStageEditor.LanguageChooser),
    });
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    const proposed = stageNameInput().value;
    expect(proposed).toMatch(/^Language Chooser/);

    const saved = await harness.submit();
    expect(saved?.stageDocument).toEqual({
      id: expect.any(String),
      type: 'LanguageChooser',
      label: { [FIXTURE_LANGUAGE]: escapeMessageText(proposed) },
    });
  });
});
