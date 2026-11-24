import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  dynamicValueNameFor,
  type LocaleTag,
  optionCaseKey,
} from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import { testId, testVariableId } from '../../testing/testId.ts';
import {
  type DynamicMessageSite,
  DynamicMessageEditor,
} from '../DynamicTextField.tsx';

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };
const LOCALE: LocaleTag = 'en';

describe('DynamicMessageEditor', () => {
  it('keeps text naming a value this place can no longer offer', async () => {
    // The one value the text names is an attribute the codebook no longer
    // has.
    const gone = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: testVariableId('deleted'),
    });
    const onMessageChange = vi.fn();
    render(
      <ProtocolLocalizationProvider localization={ENGLISH}>
        <DynamicMessageEditor
          id="text"
          name="text"
          ariaLabelledBy={undefined}
          ariaDescribedBy=""
          ariaInvalid={false}
          ariaRequired={false}
          placeholder={undefined}
          autoFocus={false}
          disabled={false}
          readOnly={false}
          markdown={false}
          singleLine
          message={`Hello {${gone}}, welcome`}
          onMessageChange={onMessageChange}
          locale={LOCALE}
          site={{
            context: { roles: new Set(['ego']), variablesFor: () => ({}) },
          }}
        />
      </ProtocolLocalizationProvider>,
    );

    const editor = await screen.findByRole('textbox');
    // Its pill says that the attribute was deleted, never the name that the
    // text uses for it.
    await waitFor(() =>
      expect(editor).toHaveTextContent('Hello Deleted attribute, welcome'),
    );
    expect(editor).not.toHaveTextContent(gone);
    expect(editor.querySelector(`[data-token="${gone}"]`)).toBeInTheDocument();
    expect(onMessageChange).not.toHaveBeenCalled();
  });
});

const MOOD_ID = testVariableId('mood');
const MOOD = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: MOOD_ID,
});
const HAPPY = testId('option/happy');
const GONE_OPTION = testId('option/gone');
const MOOD_VARIABLE = {
  name: 'mood',
  type: 'categorical' as const,
  options: [{ id: HAPPY, value: 'happy', label: { en: 'Happy' } }],
};

const renderEditor = (
  message: string,
  site: DynamicMessageSite = {
    context: {
      roles: new Set(['ego']),
      variablesFor: (role) =>
        role === 'ego' ? { [MOOD_ID]: MOOD_VARIABLE } : undefined,
    },
  },
) =>
  render(
    <ProtocolLocalizationProvider localization={ENGLISH}>
      <DynamicMessageEditor
        id="text"
        name="text"
        ariaDescribedBy=""
        readOnly={false}
        markdown={false}
        singleLine
        message={message}
        onMessageChange={() => undefined}
        locale={LOCALE}
        site={site}
      />
    </ProtocolLocalizationProvider>,
  );

/**
 * The names a text uses for its values are the protocol's, never a
 * researcher's: a value this place does not offer is called what it was, or
 * said to be deleted.
 */
describe('a value this place does not offer', () => {
  it('is called by its attribute’s name while the codebook still has it', async () => {
    const elsewhere = testVariableId('elsewhere');
    const name = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: elsewhere,
    });
    renderEditor(`Hi {${name}}`, {
      context: { roles: new Set(['ego']), variablesFor: () => ({}) },
      conditions: {
        values: {},
        codebook: {
          ego: {
            variables: { [elsewhere]: { name: 'nickname', type: 'text' } },
          },
        },
        subject: undefined,
        allowEgoRules: true,
      },
    });
    const editor = await screen.findByRole('textbox');
    await waitFor(() => expect(editor).toHaveTextContent('Hi nickname'));
    expect(editor).not.toHaveTextContent(name);
  });

  it('is shown as written only when its name refers to no kind of value', async () => {
    renderEditor('Hi {nickname}');
    const editor = await screen.findByRole('textbox');
    await waitFor(() => expect(editor).toHaveTextContent('Hi nickname'));
  });

  it('calls a version written for a deleted option a deleted option', async () => {
    const user = userEvent.setup();
    renderEditor(
      `I feel{${MOOD}, select, missing {} ${optionCaseKey(HAPPY)} { glad} ${optionCaseKey(GONE_OPTION)} { blue} other {}}`,
    );
    await screen.findByRole('textbox');
    const pill = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-versions-pill]');
      if (found === null) throw new Error('No pill');
      return found;
    });
    await user.click(pill);

    expect(
      await screen.findByRole('textbox', { name: 'Happy' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Deleted option' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: optionCaseKey(GONE_OPTION) }),
    ).not.toBeInTheDocument();
  });

  it('calls an "If" on a deleted condition an "If" on a deleted condition', async () => {
    const name = dynamicValueNameFor({
      kind: 'condition',
      conditionId: testId('condition/gone'),
    });
    renderEditor(`Hi{${name}, select, true { there} other {}}`);
    const editor = await screen.findByRole('textbox');
    await waitFor(() =>
      expect(editor).toHaveTextContent('If: Deleted condition'),
    );
    expect(editor).not.toHaveTextContent(name);
  });
});

describe('a text the editor cannot hold', () => {
  it('is a fault, since validation refuses a protocol holding one', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <ProtocolLocalizationProvider localization={ENGLISH}>
          <DynamicMessageEditor
            id="text"
            name="title"
            ariaLabelledBy={undefined}
            ariaDescribedBy=""
            ariaInvalid={false}
            ariaRequired={false}
            placeholder={undefined}
            autoFocus={false}
            disabled={false}
            readOnly={false}
            markdown={false}
            singleLine
            message="Welcome, {name"
            onMessageChange={vi.fn()}
            locale={LOCALE}
            site={{
              context: { roles: new Set(['ego']), variablesFor: () => ({}) },
            }}
          />
        </ProtocolLocalizationProvider>,
      ),
    ).toThrow('The text of "title" cannot be opened for editing.');
    logged.mockRestore();
  });
});
