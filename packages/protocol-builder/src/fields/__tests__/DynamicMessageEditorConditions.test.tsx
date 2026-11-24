import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  dynamicValueNameFor,
  isProtocolObjectId,
  type LocaleTag,
} from '@codaco/protocol-validation';

import type { ConditionDraft } from '../../localization/conditionText.ts';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import { testId, testVariableId } from '../../testing/testId.ts';
import { DynamicMessageEditor } from '../DynamicTextField.tsx';

const AGE = testVariableId('age');

const RULES: ConditionDraft = {
  rules: [
    {
      id: testId('rule/age'),
      type: 'ego',
      options: { attribute: AGE, operator: 'EXISTS' },
    },
  ],
};

// The rule builder is tested on its own; here the dialog only hands back the
// rules a researcher set, so the editor's bookkeeping is what is asked.
vi.mock('../../rules/ConditionDialog.tsx', () => ({
  default: ({ onSave }: { onSave: (condition: ConditionDraft) => void }) => (
    <button type="button" onClick={() => onSave(RULES)}>
      Save rules
    </button>
  ),
}));

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };
const LOCALE: LocaleTag = 'en';

const TALL = testId('condition/tall');
const TALL_NAME = dynamicValueNameFor({ kind: 'condition', conditionId: TALL });
const TESTS_TALL = `Hello{${TALL_NAME}, select, true { there} other {}}`;

type Held = {
  message: string;
  conditions: Readonly<Record<string, unknown>>;
};

const siteFor = (
  conditions: Readonly<Record<string, unknown>>,
  setConditions: (next: Readonly<Record<string, unknown>>) => void,
) => ({
  context: {
    roles: new Set(['ego'] as const),
    variablesFor: (role: string) =>
      role === 'ego' ? { [AGE]: { name: 'age', type: 'number' as const } } : {},
    conditions: new Map(Object.keys(conditions).map((id) => [id, {}])),
  },
  conditions: {
    values: conditions,
    set: setConditions,
    codebook: {
      ego: { variables: { [AGE]: { name: 'age', type: 'number' as const } } },
    },
    subject: undefined,
    allowEgoRules: true,
  },
});

/**
 * Texts on one stage, and the conditions of that stage, held as a stage form
 * holds them: every text reads and writes the same conditions.
 */
const renderEditors = (
  messages: readonly string[],
  conditions: Readonly<Record<string, unknown>>,
) => {
  const held: { current: Held[] } = {
    current: messages.map((message) => ({ message, conditions })),
  };
  function Host() {
    const [texts, setTexts] = useState(messages);
    const [stageConditions, setConditions] = useState(conditions);
    useLayoutEffect(() => {
      held.current = texts.map((message) => ({
        message,
        conditions: stageConditions,
      }));
    });
    return (
      <>
        {texts.map((message, index) => (
          <DynamicMessageEditor
            // oxlint-disable-next-line react/no-array-index-key -- a fixed list of editors, one for each text
            key={index}
            id={`text-${index}`}
            name={`text-${index}`}
            ariaDescribedBy=""
            readOnly={false}
            markdown={false}
            singleLine
            message={message}
            onMessageChange={(next) =>
              setTexts((current) =>
                current.map((each, at) => (at === index ? (next ?? '') : each)),
              )
            }
            locale={LOCALE}
            site={siteFor(stageConditions, setConditions)}
          />
        ))}
      </>
    );
  }
  render(
    <ProtocolLocalizationProvider localization={ENGLISH}>
      <Host />
    </ProtocolLocalizationProvider>,
  );
  return { held, user: userEvent.setup() };
};

/** One text and the conditions of its stage. */
const renderEditor = (initial: Held) => {
  const { held, user } = renderEditors([initial.message], initial.conditions);
  return {
    held: {
      get current(): Held {
        const [first] = held.current;
        if (first === undefined) throw new Error('No text');
        return first;
      },
    },
    user,
  };
};

describe('an "If" written in a text', () => {
  it('declares a condition with a new UUID, which the text names', async () => {
    const { held, user } = renderEditor({ message: 'Hello', conditions: {} });
    const editor = await screen.findByRole('textbox');
    await user.click(editor);
    await user.click(screen.getByRole('button', { name: 'Insert logic' }));
    await user.click(await screen.findByRole('option', { name: /^If … else/ }));
    await user.click(await screen.findByRole('button', { name: 'Save rules' }));

    await waitFor(() =>
      expect(Object.keys(held.current.conditions)).toHaveLength(1),
    );
    const [conditionId] = Object.keys(held.current.conditions);
    expect(isProtocolObjectId(conditionId)).toBe(true);
    expect(held.current.conditions[conditionId ?? '']).toEqual(RULES);
    expect(held.current.message).toContain(
      `{${dynamicValueNameFor({ kind: 'condition', conditionId: conditionId ?? '' })}, select, true {`,
    );
  });
});

/**
 * A condition stays with the stage while it is edited, whatever its text
 * does, and the stage's save drops it once no text names it
 * (`withoutUnusedConditions`).
 */
describe('removing the last text that tests a condition', () => {
  it('leaves the condition on the stage, and undoing the removal brings the text back', async () => {
    const { held, user } = renderEditor({
      message: TESTS_TALL,
      conditions: { [TALL]: RULES },
    });
    const editor = await screen.findByRole('textbox');
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}{Backspace}');

    await waitFor(() => expect(held.current.message).not.toContain(TALL_NAME));
    expect(held.current.conditions).toEqual({ [TALL]: RULES });

    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(held.current.message).toContain(TALL_NAME));
    expect(held.current.conditions).toEqual({ [TALL]: RULES });
  });
});

describe('an "If" cut from one text and pasted into another', () => {
  it('keeps the condition it tests, with its rules', async () => {
    const { held, user } = renderEditors([TESTS_TALL, 'Goodbye'], {
      [TALL]: RULES,
    });
    const [from, to] = await screen.findAllByRole('textbox');
    if (from === undefined || to === undefined) throw new Error('No editors');

    await user.click(from);
    await user.keyboard('{Control>}a{/Control}');
    // The editor writes what is cut to the event's own clipboard data, which
    // is pasted as it is.
    const cut = await user.cut();
    await waitFor(() =>
      expect(held.current[0]?.message).not.toContain(TALL_NAME),
    );

    await user.click(to);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(cut);
    await waitFor(() => expect(held.current[1]?.message).toContain(TALL_NAME));
    expect(held.current[1]?.conditions).toEqual({ [TALL]: RULES });
  });
});
