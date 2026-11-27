import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import {
  type DynamicAttribute,
  dynamicAttributesContextOf,
  dynamicValueNameFor,
  type LocaleTag,
  optionCaseKey,
} from '@codaco/protocol-validation';

import type { ProtocolLocalization } from '../../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../../localization/ProtocolLocalization.tsx';
import { testId, testVariableId } from '../../../testing/testId.ts';
import { DynamicMessageEditor } from '../DynamicMessageEditor.tsx';
import type { DynamicMessageSite } from '../messageSite.ts';

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };
const LOCALE: LocaleTag = 'en';

const MOOD_ID = testVariableId('mood');
const MOOD = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: MOOD_ID,
});
const HAPPY = testId('option/happy');
const HAPPY_KEY = optionCaseKey(HAPPY);
const MOOD_VARIABLE = {
  name: 'mood',
  type: 'categorical' as const,
  options: [{ id: HAPPY, value: 'happy', label: { en: 'Happy' } }],
};

const AGE_ID = testVariableId('age');
const AGE = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: AGE_ID,
});
const AGE_VARIABLE = { name: 'age', type: 'number' as const };

const EGO_VARIABLES = { [MOOD_ID]: MOOD_VARIABLE, [AGE_ID]: AGE_VARIABLE };

/** Number wording, written in English only. */
const YEARS = testId('dynamic/years');
const YEARS_NAME = dynamicValueNameFor({ kind: 'dynamicAttribute', id: YEARS });
const YEARS_DEFINITION: DynamicAttribute = {
  logic: 'number',
  value: AGE,
  missing: { en: 'some years' },
  wording: { en: '{count, plural, one {# year} other {# years}}' },
};

const ENGLISH_AND_SPANISH: ProtocolLocalization = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

const PRONOUN = testId('dynamic/pronoun');
const PRONOUN_NAME = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: PRONOUN,
});
const PRONOUN_DEFINITION: DynamicAttribute = {
  logic: 'answers',
  value: MOOD,
  missing: { en: 'someone' },
  answers: [{ answer: HAPPY_KEY, wording: { en: 'happy one' } }],
  other: { en: 'person' },
};

type Held = {
  message: string;
  conditions: Readonly<Record<string, unknown>>;
  dynamicAttributes: Readonly<Record<string, unknown>>;
};

type HostOptions = Readonly<{
  message: string;
  dynamicAttributes?: Readonly<Record<string, unknown>>;
  multiLine?: boolean;
  localization?: ProtocolLocalization;
  /** The language being edited. */
  locale?: LocaleTag;
}>;

/**
 * One text, and the conditions and dynamic attributes of its stage, held as
 * a stage form holds them. The participant's mood is the one attribute it
 * can show; no rules can be written here, so the first logic offered is a
 * version for each answer.
 */
const renderHost = ({
  message,
  dynamicAttributes = {},
  multiLine = false,
  localization = ENGLISH,
  locale = LOCALE,
}: HostOptions) => {
  const held: { current: Held } = {
    current: { message, conditions: {}, dynamicAttributes },
  };
  const onMessageChange = vi.fn();
  function Host() {
    const [text, setText] = useState(message);
    const [conditions, setConditions] = useState<
      Readonly<Record<string, unknown>>
    >({});
    const [definitions, setDefinitions] = useState(dynamicAttributes);
    useLayoutEffect(() => {
      held.current = {
        message: text,
        conditions,
        dynamicAttributes: definitions,
      };
    });
    const site: DynamicMessageSite = {
      context: {
        roles: new Set(['ego']),
        variablesFor: (role) => (role === 'ego' ? EGO_VARIABLES : undefined),
        dynamicAttributes: dynamicAttributesContextOf(definitions),
      },
      conditions: {
        values: conditions,
        set: setConditions,
        codebook: { ego: { variables: EGO_VARIABLES } },
        subject: undefined,
        allowEgoRules: false,
      },
      dynamicAttributes: { values: definitions, set: setDefinitions },
    };
    return (
      <DynamicMessageEditor
        id="text"
        name="text"
        ariaDescribedBy=""
        readOnly={false}
        markdown={multiLine}
        singleLine={!multiLine}
        message={text}
        onMessageChange={(next) => {
          onMessageChange(next);
          setText(next ?? '');
        }}
        locale={locale}
        site={site}
      />
    );
  }
  const { unmount } = render(
    <ProtocolLocalizationProvider localization={localization}>
      <DialogProvider>
        <Host />
      </DialogProvider>
    </ProtocolLocalizationProvider>,
  );
  return { held, onMessageChange, unmount, user: userEvent.setup() };
};

/**
 * Clicks a value's pill. The editor finds what was clicked through
 * `elementFromPoint`, which jsdom does not implement, so the pill is what is
 * at every point while it is clicked.
 */
const clickPill = async (
  user: ReturnType<typeof userEvent.setup>,
  pill: HTMLElement,
) => {
  const original = document.elementFromPoint.bind(document);
  const target = pill.querySelector('data') ?? pill;
  document.elementFromPoint = () => target;
  try {
    await user.click(target);
  } finally {
    document.elementFromPoint = original;
  }
};

/** The pill drawn for the value `name` in the text. */
const pillIn = (editor: HTMLElement, name: string) =>
  editor.querySelector<HTMLElement>(`[data-inline-value="${name}"]`);

describe('the values of a text', () => {
  it('keeps a value this place can no longer offer, saying that it was deleted', async () => {
    const gone = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: testVariableId('deleted'),
    });
    const { onMessageChange } = renderHost({
      message: `Hello {${gone}}, welcome`,
    });
    const editor = await screen.findByRole('textbox');
    await waitFor(() =>
      expect(
        pillIn(editor, gone)?.querySelector('data[value="Deleted attribute"]'),
      ).toBeInTheDocument(),
    );
    expect(pillIn(editor, gone)?.querySelector('data')).toHaveAttribute(
      'data-attribute-missing',
    );
    expect(onMessageChange).not.toHaveBeenCalled();
  });

  it('draws a dynamic attribute as the pill of its wordings', async () => {
    renderHost({
      message: `Hello {${PRONOUN_NAME}}`,
      dynamicAttributes: { [PRONOUN]: PRONOUN_DEFINITION },
    });
    const editor = await screen.findByRole('textbox');
    await waitFor(() =>
      expect(
        pillIn(editor, PRONOUN_NAME)?.querySelector('data'),
      ).toHaveAttribute('value', 'someone / happy one / person'),
    );
    expect(pillIn(editor, PRONOUN_NAME)?.querySelector('data')).toHaveAttribute(
      'data-attribute-type',
      'dynamic',
    );
  });

  it('draws number wording as the pill of what it reads, not as its syntax', async () => {
    renderHost({
      message: `Aged {${YEARS_NAME}}`,
      dynamicAttributes: { [YEARS]: YEARS_DEFINITION },
    });
    const editor = await screen.findByRole('textbox');
    await waitFor(() =>
      expect(pillIn(editor, YEARS_NAME)?.querySelector('data')).toHaveAttribute(
        'value',
        'some years / 1 year / 0 years',
      ),
    );
  });

  it('reads a value named in the interface’s words in the interface’s language, and an attribute’s name in its own', async () => {
    renderHost({ message: `On {now}, {${MOOD}}` });
    const editor = await screen.findByRole('textbox');
    const nameOf = (value: string) =>
      pillIn(editor, value)?.querySelector('data [dir]') ?? null;
    await waitFor(() =>
      expect(nameOf('now')).toHaveTextContent('Today’s date'),
    );
    expect(nameOf('now')).toHaveAttribute('lang', 'en');
    expect(nameOf(MOOD)).toHaveTextContent('mood');
    expect(nameOf(MOOD)).not.toHaveAttribute('lang');
    expect(nameOf(MOOD)).toHaveAttribute('dir', 'auto');
  });

  it('shows text that it cannot open as it is stored, rather than failing', async () => {
    renderHost({ message: `Hi{${MOOD}, select, missing {} other { there}}` });
    expect(
      await screen.findByText(/This wording cannot be edited here/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('the Attribute menu', () => {
  it('lists what the text can show under the heading of whose it is, and puts the chosen one in', async () => {
    const { user, held } = renderHost({ message: 'Hello ' });
    const editor = await screen.findByRole('textbox');
    await user.click(editor);
    await user.click(screen.getByRole('button', { name: 'Attribute' }));

    const menu = await screen.findByRole('dialog', {
      name: 'Insert an attribute',
    });
    expect(within(menu).getByText('Ego attributes')).toBeInTheDocument();
    expect(within(menu).getByText('Dynamic attributes')).toBeInTheDocument();
    expect(within(menu).getByText('Interview attributes')).toBeInTheDocument();

    await user.click(within(menu).getByRole('option', { name: /^mood/ }));
    await waitFor(() => expect(held.current.message).toContain(`{${MOOD}}`));
  });

  it('creates a dynamic attribute with a version for each answer, and puts its pill in', async () => {
    const { user, held } = renderHost({ message: 'Hello ' });
    const editor = await screen.findByRole('textbox');
    await user.click(editor);
    await user.click(screen.getByRole('button', { name: 'Attribute' }));
    await user.click(
      await screen.findByRole('option', { name: 'Create dynamic attribute' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Create a dynamic attribute',
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'If not known' }),
      'someone',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Happy' }),
      'happy one',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Any other answer' }),
      'person',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create dynamic attribute' }),
    );

    await waitFor(() =>
      expect(Object.values(held.current.dynamicAttributes)).toEqual([
        PRONOUN_DEFINITION,
      ]),
    );
    const [id] = Object.keys(held.current.dynamicAttributes);
    if (id === undefined) throw new Error('No dynamic attribute');
    await waitFor(() =>
      expect(held.current.message).toContain(
        `{${dynamicValueNameFor({ kind: 'dynamicAttribute', id })}}`,
      ),
    );
  });
});

describe('the versions of a new dynamic attribute', () => {
  const openDialog = async () => {
    const host = renderHost({ message: 'Hello ' });
    const editor = await screen.findByRole('textbox');
    await host.user.click(editor);
    await host.user.click(screen.getByRole('button', { name: 'Attribute' }));
    await host.user.click(
      await screen.findByRole('option', { name: 'Create dynamic attribute' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Create a dynamic attribute',
    });
    return { ...host, dialog };
  };

  it('may be left empty, which shows nothing, and is saved as empty wording', async () => {
    const { user, held, dialog } = await openDialog();
    const unknown = within(dialog).getByRole('textbox', {
      name: 'If not known',
    });
    expect(unknown).toHaveAttribute('placeholder', 'Shows nothing');

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Happy' }),
      'happy one',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create dynamic attribute' }),
    );

    await waitFor(() =>
      expect(Object.values(held.current.dynamicAttributes)).toEqual([
        {
          ...PRONOUN_DEFINITION,
          missing: { en: '' },
          other: { en: '' },
        },
      ]),
    );
  });

  it('are stored as the words typed, braces and apostrophes included', async () => {
    const { user, held, dialog } = await openDialog();
    const happy = within(dialog).getByRole('textbox', { name: 'Happy' });
    await user.type(happy, "you {{sic} it's");
    expect(happy).toHaveValue("you {sic} it's");
    await user.click(
      within(dialog).getByRole('button', { name: 'Create dynamic attribute' }),
    );

    await waitFor(() =>
      expect(Object.values(held.current.dynamicAttributes)).toMatchObject([
        {
          answers: [
            { answer: HAPPY_KEY, wording: { en: "you '{'sic'}' it's" } },
          ],
        },
      ]),
    );
  });
});

describe('the pill of a dynamic attribute', () => {
  it('says that it shows nothing when every version is empty', async () => {
    renderHost({
      message: `Hello {${PRONOUN_NAME}} today`,
      dynamicAttributes: {
        [PRONOUN]: {
          ...PRONOUN_DEFINITION,
          missing: { en: '' },
          answers: [{ answer: HAPPY_KEY, wording: { en: '' } }],
          other: { en: '' },
        },
      },
    });
    const editor = await screen.findByRole('textbox');
    await waitFor(() =>
      expect(pillIn(editor, PRONOUN_NAME)).toHaveTextContent('Shows nothing'),
    );
  });

  it('leaves out the versions that are empty', async () => {
    renderHost({
      message: `Hello {${PRONOUN_NAME}} today`,
      dynamicAttributes: {
        [PRONOUN]: { ...PRONOUN_DEFINITION, missing: { en: '' } },
      },
    });
    const editor = await screen.findByRole('textbox');
    await waitFor(() =>
      expect(pillIn(editor, PRONOUN_NAME)).toHaveTextContent(
        'happy one / person',
      ),
    );
  });
});

describe('the settings of a dynamic attribute', () => {
  it('open from its pill, write each change to the stage, and can take every use of it out of the wording', async () => {
    const { user, held } = renderHost({
      message: `Hello {${PRONOUN_NAME}} today, {${PRONOUN_NAME}}`,
      dynamicAttributes: { [PRONOUN]: PRONOUN_DEFINITION },
    });
    const editor = await screen.findByRole('textbox');
    const pill = await waitFor(() => {
      const found = pillIn(editor, PRONOUN_NAME);
      if (found === null) throw new Error('No pill');
      return found;
    });
    await clickPill(user, pill);

    const popover = await screen.findByRole('dialog', {
      name: 'Dynamic attribute',
    });
    expect(popover).toHaveTextContent(
      'Changes apply everywhere that this dynamic attribute is used on this stage. It is used in 1 place.',
    );
    const happy = within(popover).getByRole('textbox', { name: 'Happy' });
    await user.clear(happy);
    await user.type(happy, 'cheerful');
    await waitFor(() =>
      expect(held.current.dynamicAttributes[PRONOUN]).toMatchObject({
        answers: [{ answer: HAPPY_KEY, wording: { en: 'cheerful' } }],
      }),
    );

    const withPills = held.current.message;
    await user.click(
      within(popover).getByRole('button', { name: 'Remove from this wording' }),
    );
    // The pill that was not clicked goes too.
    await waitFor(() =>
      expect(held.current.message).not.toContain(PRONOUN_NAME),
    );
    expect(held.current.message).toContain('Hello');
    expect(held.current.message).toContain('today,');
    // Other text on the stage may still use it.
    expect(held.current.dynamicAttributes).toHaveProperty(PRONOUN);

    // Both pills went in one edit, which one Undo takes back.
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(held.current.message).toBe(withPills));
  });
});

describe('a version edited in the settings of a dynamic attribute', () => {
  const openSettings = async (definition: DynamicAttribute) => {
    const host = renderHost({
      message: `Hello {${PRONOUN_NAME}} today`,
      dynamicAttributes: { [PRONOUN]: definition },
    });
    const editor = await screen.findByRole('textbox');
    const pill = await waitFor(() => {
      const found = pillIn(editor, PRONOUN_NAME);
      if (found === null) throw new Error('No pill');
      return found;
    });
    await clickPill(host.user, pill);
    const popover = await screen.findByRole('dialog', {
      name: 'Dynamic attribute',
    });
    return { ...host, popover };
  };

  it('is kept as empty wording when it is cleared, and shows nothing', async () => {
    const { user, held, popover } = await openSettings(PRONOUN_DEFINITION);
    const happy = within(popover).getByRole('textbox', { name: 'Happy' });
    await user.clear(happy);

    await waitFor(() =>
      expect(held.current.dynamicAttributes[PRONOUN]).toMatchObject({
        answers: [{ answer: HAPPY_KEY, wording: { en: '' } }],
      }),
    );
    expect(happy).toHaveAttribute('placeholder', 'Shows nothing');
    expect(within(popover).queryByText(/^Write /)).toBeNull();
  });

  it('says what is wrong with wording that is not plain words, as an imported version can be', async () => {
    const { popover } = await openSettings({
      ...PRONOUN_DEFINITION,
      other: { en: 'you {sic}' },
    });
    expect(
      within(popover).getByText(
        'Write this version as plain words, without placeholders or formatting.',
      ),
    ).toBeInTheDocument();
  });
});

describe('the number wording of a dynamic attribute', () => {
  const openSettings = async () => {
    const host = renderHost({
      message: `Tiene {${YEARS_NAME}}`,
      dynamicAttributes: { [YEARS]: YEARS_DEFINITION },
      localization: ENGLISH_AND_SPANISH,
      locale: 'es',
    });
    const editor = await screen.findByRole('textbox');
    const pill = await waitFor(() => {
      const found = pillIn(editor, YEARS_NAME);
      if (found === null) throw new Error('No pill');
      return found;
    });
    await clickPill(host.user, pill);
    const popover = await screen.findByRole('dialog', {
      name: 'Dynamic attribute',
    });
    return { ...host, popover };
  };

  it('offers a box for each plural form of a language that has no wording yet, and writes only that language', async () => {
    const { user, held, popover } = await openSettings();
    const boxes = await within(popover).findAllByRole('textbox', {
      name: /^When it is/,
    });
    // Spanish has a form for 1, for millions and for any other number.
    expect(boxes).toHaveLength(3);
    // The English wording is shown for reference, as it reads.
    expect(popover).toHaveTextContent('English: 1 year / 0 years');

    const [one] = boxes;
    if (one === undefined) throw new Error('No box for 1');
    await user.type(one, ' año');
    await waitFor(() =>
      expect(held.current.dynamicAttributes[YEARS]).toMatchObject({
        wording: {
          en: '{count, plural, one {# year} other {# years}}',
          es: expect.stringMatching(/^{count, plural, one {[^}]*año[^}]*} /),
        },
      }),
    );
  });

  it('offers nothing to put in but its number', async () => {
    const { popover } = await openSettings();
    await within(popover).findAllByRole('textbox', { name: /^When it is/ });
    expect(
      within(popover).queryByRole('button', { name: 'Attribute' }),
    ).toBeNull();
  });
});

const ANSWERS_BLOCK = [
  'Before',
  '',
  `{${MOOD}, select, missing {} ${HAPPY_KEY} {Glad to hear it.} other {Thanks.}}`,
  '',
  'After',
].join('\n');

describe('a logic block', () => {
  it('labels each branch with the case in which it is shown', async () => {
    renderHost({ message: ANSWERS_BLOCK, multiLine: true });
    const editor = await screen.findByRole('textbox');
    await waitFor(() =>
      expect(editor.querySelectorAll('[data-logic-branch-view]')).toHaveLength(
        3,
      ),
    );
    const labels = [...editor.querySelectorAll('[data-logic-branch-view]')].map(
      (branch) => branch.getAttribute('data-key'),
    );
    expect(labels).toEqual(['missing', HAPPY_KEY, 'otherwise']);
    expect(editor).toHaveTextContent('If not known');
    expect(editor).toHaveTextContent('Any other answer');
    expect(editor).toHaveTextContent('Glad to hear it.');
  });

  it('asks before a change to its settings deletes a branch with content, and can be deleted', async () => {
    const { user, held } = renderHost({
      message: ANSWERS_BLOCK,
      multiLine: true,
    });
    await screen.findByRole('textbox');
    await user.click(
      await screen.findByRole('button', { name: 'Logic block settings' }),
    );
    const popover = await screen.findByRole('dialog', { name: 'Logic block' });
    await user.click(within(popover).getByRole('checkbox', { name: 'Happy' }));

    const confirm = await screen.findByRole('dialog', {
      name: 'Delete content?',
    });
    await user.click(
      within(confirm).getByRole('button', { name: 'Delete content' }),
    );
    await waitFor(() =>
      expect(held.current.message).not.toContain('Glad to hear it.'),
    );
    expect(held.current.message).toContain('Thanks.');
    // The settings stay open behind the question, and after it.
    expect(
      screen.getByRole('dialog', { name: 'Logic block' }),
    ).toBeInTheDocument();
    expect(
      within(popover).getByRole('checkbox', { name: 'Happy' }),
    ).not.toBeChecked();

    // The block's own button, beside its settings.
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Logic block' }),
      ).not.toBeInTheDocument(),
    );
    // It still contains content, so deleting it asks first.
    await user.click(
      await screen.findByRole('button', { name: 'Delete logic block' }),
    );
    const cancelled = await screen.findByRole('dialog', {
      name: 'Delete logic block?',
    });
    await user.click(within(cancelled).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete logic block?' }),
      ).not.toBeInTheDocument(),
    );
    expect(held.current.message).toContain(MOOD);

    await user.click(
      screen.getByRole('button', { name: 'Delete logic block' }),
    );
    const confirmDelete = await screen.findByRole('dialog', {
      name: 'Delete logic block?',
    });
    await user.click(
      within(confirmDelete).getByRole('button', { name: 'Delete logic block' }),
    );
    await waitFor(() => expect(held.current.message).not.toContain(MOOD));
    expect(held.current.message).toContain('Before');
    expect(held.current.message).toContain('After');
  });

  it('is deleted without a question when none of its versions contains anything', async () => {
    const { user, held } = renderHost({
      message: [
        'Before',
        '',
        `{${MOOD}, select, missing {} ${HAPPY_KEY} {} other {}}`,
        '',
        'After',
      ].join('\n'),
      multiLine: true,
    });
    await screen.findByRole('textbox');
    await user.click(
      await screen.findByRole('button', { name: 'Delete logic block' }),
    );
    await waitFor(() => expect(held.current.message).not.toContain(MOOD));
    expect(
      screen.queryByRole('dialog', { name: 'Delete logic block?' }),
    ).not.toBeInTheDocument();
  });

  it('is put in from the toolbar with its settings open', async () => {
    const { user, held } = renderHost({ message: 'Intro', multiLine: true });
    const editor = await screen.findByRole('textbox');
    await user.click(editor);
    await user.click(screen.getByRole('button', { name: 'Logic block' }));

    expect(
      await screen.findByRole('dialog', { name: 'Logic block' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(held.current.message).toContain(`{${MOOD}, select,`),
    );
    expect(held.current.message).toContain('Intro');
  });
});

describe('a logic block for singular or plural numbers', () => {
  const ENGLISH_AND_ARABIC: ProtocolLocalization = {
    defaultLocale: 'en',
    locales: ['en', 'ar'],
  };
  // Written in English, with English's number forms, and pasted into the
  // Arabic text.
  const ENGLISH_BLOCK = [
    'Before',
    '',
    `{${AGE}, select, missing {} other {{${AGE}, plural, one {One year} other {Many years}}}}`,
  ].join('\n');

  it('offers the number forms of the language being edited that it has no version for, and keeps its content', async () => {
    const { user, held } = renderHost({
      message: ENGLISH_BLOCK,
      multiLine: true,
      localization: ENGLISH_AND_ARABIC,
      locale: 'ar',
    });
    const editor = await screen.findByRole('textbox');
    const add = await screen.findByRole('button', {
      name: /^Add a version for each number form of /,
    });
    await user.click(add);

    await waitFor(() =>
      expect(
        [...editor.querySelectorAll('[data-logic-branch-view]')].map((branch) =>
          branch.getAttribute('data-key'),
        ),
      ).toEqual(['missing', 'zero', 'one', 'two', 'few', 'many', 'other']),
    );
    expect(held.current.message).toContain('One year');
    expect(held.current.message).toContain('Many years');
    expect(
      screen.queryByRole('button', {
        name: /^Add a version for each number form of /,
      }),
    ).not.toBeInTheDocument();
  });

  it('offers nothing when it has a version for each number form', async () => {
    renderHost({ message: ENGLISH_BLOCK, multiLine: true });
    await screen.findByRole('textbox');
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-logic-branch-view]'),
      ).toHaveLength(3),
    );
    expect(
      screen.queryByRole('button', {
        name: /^Add a version for each number form of /,
      }),
    ).not.toBeInTheDocument();
  });
});

describe('the toolbar group of the insert tools', () => {
  it('is named by what it contains: an attribute, and a logic block in text with several lines', async () => {
    const { unmount } = renderHost({ message: 'Hello' });
    expect(
      await screen.findByRole('group', { name: 'Insert an attribute' }),
    ).toContainElement(screen.getByRole('button', { name: 'Attribute' }));
    unmount();

    renderHost({ message: 'Intro', multiLine: true });
    const group = await screen.findByRole('group', {
      name: 'Insert an attribute or logic block',
    });
    expect(group).toContainElement(
      screen.getByRole('button', { name: 'Logic block' }),
    );
  });
});

describe('undo', () => {
  it('takes back a value put in from the Attribute menu', async () => {
    const { user, held } = renderHost({ message: 'Hello' });
    const editor = await screen.findByRole('textbox');
    await user.click(editor);
    await user.click(screen.getByRole('button', { name: 'Attribute' }));
    await user.click(await screen.findByRole('option', { name: /^mood/ }));
    await waitFor(() => expect(held.current.message).toContain(MOOD));

    await user.click(editor);
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(held.current.message).not.toContain(MOOD));
  });
});

describe('a line that the stored text cannot contain', () => {
  it('stays in the text when the editor loses focus', async () => {
    const { user, onMessageChange } = renderHost({
      message: 'Hello',
      multiLine: true,
    });
    const editor = await screen.findByRole('textbox');
    await user.click(editor);
    await user.type(editor, ' there');
    await waitFor(() =>
      expect(onMessageChange).toHaveBeenLastCalledWith('Hello there'),
    );

    // An empty paragraph after the last one writes nothing new.
    await user.keyboard('{Enter}');
    expect(editor.querySelectorAll('p')).toHaveLength(2);
    const writes = onMessageChange.mock.calls.length;

    await user.click(document.body);
    await waitFor(() => expect(editor).not.toHaveFocus());
    expect(editor.querySelectorAll('p')).toHaveLength(2);
    expect(onMessageChange).toHaveBeenCalledTimes(writes);
  });
});
