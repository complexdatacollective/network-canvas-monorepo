import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '@codaco/fresco-ui/Button';
import type { VariableOption } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import { testTypeId, testVariableId } from '../../testing/testId.ts';
import type { CodebookWriteOutcome } from '../writes.ts';
import VariableEditor from './VariableEditor.tsx';

const PERSON = testTypeId('person');
const SUBJECT = { entity: 'node', type: PERSON } as const;
const CLOSENESS_ID = testVariableId('closeness');
const CONSENT = testVariableId('consent');
const MET = testVariableId('met');
const RAPPORT = testVariableId('rapport');
const PREFERENCE = testVariableId('preference');
const NEW_ATTRIBUTE = testVariableId('newAttribute');

const ENGLISH: ProtocolLocalization = { defaultLocale: 'en', locales: ['en'] };

/** A protocol written in English and translated into Spanish. */
const ENGLISH_AND_SPANISH: ProtocolLocalization = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

const contextIn = (
  localization: ProtocolLocalization,
): ProtocolBuilderProtocolContext => ({
  codebook: { node: {}, edge: {} },
  assets: {},
  orderedStages: [],
  issues: [],
  localization,
});
const LOCKED_OPTIONS: readonly VariableOption[] = [
  { label: { en: 'Woman' }, value: 'woman' },
  { label: { en: 'Man' }, value: 'man' },
  { label: { en: 'Another identity' }, value: 'another_identity' },
];

/**
 * One attribute, in the state the editor opens on it.
 *
 * `committed` is what the codebook holds and `draft` is what the host opened
 * the editor with, which are not the same thing: a host opens this editor on
 * the control and the values the researcher has just chosen, and the two are
 * what decide whether the save button is live at all. Every case whose draft
 * differs from its committed variable can therefore be saved, which is what
 * puts each surface's own refusal on screen.
 */
type SurfaceCase = Readonly<{
  variableId: string;
  committed: SectionDoc;
  draft: SectionDoc;
}>;

const CLOSENESS: SectionDoc = {
  name: 'closeness',
  type: 'ordinal',
  options: [
    { label: { en: 'Not close' }, value: 1 },
    { label: { en: 'Very close' }, value: 2 },
  ],
};

const SURFACES = {
  /** A choice list, which is what every earlier story here showed. */
  options: {
    variableId: CLOSENESS_ID,
    committed: CLOSENESS,
    draft: CLOSENESS,
  },
  /**
   * The two answers a yes/no attribute puts in front of a participant, opened
   * with one of them cleared — the state the schema accepts and a participant
   * cannot answer.
   */
  booleanAnswers: {
    variableId: CONSENT,
    committed: {
      name: 'consent',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: { en: 'I agree' }, value: true },
        { label: { en: 'I do not agree' }, value: false, negative: true },
      ],
    },
    draft: {
      name: 'consent',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: { en: 'I agree' }, value: true },
        { value: false, negative: true },
      ],
    },
  },
  /**
   * A yes/no attribute offering more answers than the two this editor writes.
   * Valid — `booleanOptionsSchema` sets no length and the interview's boolean
   * control renders every entry — so the list is shown and left alone rather
   * than edited down to a pair.
   */
  heldAnswers: {
    variableId: CONSENT,
    committed: {
      name: 'consent',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: { en: 'I agree' }, value: true },
        { label: { en: 'I do not agree' }, value: false, negative: true },
        { label: { en: 'I would rather not say' }, value: false },
      ],
    },
    draft: {
      name: 'consent',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: { en: 'I agree' }, value: true },
        { label: { en: 'I do not agree' }, value: false, negative: true },
        { label: { en: 'I would rather not say' }, value: false },
      ],
    },
  },
  /**
   * A yes/no attribute whose two answers both record `true`. Valid too — the
   * schema relates neither entry's `value` to the other's — and a pair this
   * editor's two fields, which are told apart by exactly that value, cannot
   * be. Shown and left alone for the same reason.
   */
  heldAnswerValues: {
    variableId: CONSENT,
    committed: {
      name: 'consent',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: { en: 'I agree' }, value: true },
        { label: { en: 'I agree, with conditions' }, value: true },
      ],
    },
    draft: {
      name: 'consent',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: { en: 'I agree' }, value: true },
        { label: { en: 'I agree, with conditions' }, value: true },
      ],
    },
  },
  /** A date field's resolution and the two dates it is bounded by, reversed. */
  dateSettings: {
    variableId: MET,
    committed: {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2024-12-31' },
    },
    draft: {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2024-01-01', max: '2020-01-01' },
    },
  },
  /** The words at each end of a sliding scale, with the high end cleared. */
  scaleSettings: {
    variableId: RAPPORT,
    committed: {
      name: 'rapport',
      type: 'scalar',
      component: 'VisualAnalogScale',
      parameters: {
        minLabel: { en: 'Not at all close' },
        maxLabel: { en: 'Extremely close' },
      },
    },
    draft: {
      name: 'rapport',
      type: 'scalar',
      component: 'VisualAnalogScale',
      parameters: {
        minLabel: { en: 'Not at all close' },
        maxLabel: { en: '   ' },
      },
    },
  },
  /**
   * A rule requiring three answers, on an attribute whose third option the
   * play removes.
   *
   * The refusal is written by the codebook schema's own contradiction
   * analyser, which the editor runs over the whole entity before it asks the
   * host anything — so the host is never reached, and `contradiction` is not
   * set here. What that analyser writes already names the rule and the values
   * that cannot both hold, which is why the editor shows it as written rather
   * than replacing it with the copy it keeps for a save that did not happen.
   */
  contradiction: {
    variableId: PREFERENCE,
    committed: {
      name: 'preference',
      type: 'categorical',
      options: [
        { label: { en: 'Low' }, value: 'low' },
        { label: { en: 'Middle' }, value: 'middle' },
        { label: { en: 'High' }, value: 'high' },
      ],
      validation: { minSelected: 3 },
    },
    draft: {
      name: 'preference',
      type: 'categorical',
      options: [
        { label: { en: 'Low' }, value: 'low' },
        { label: { en: 'Middle' }, value: 'middle' },
        { label: { en: 'High' }, value: 'high' },
      ],
      validation: { minSelected: 3 },
    },
  },
} as const satisfies Record<string, SurfaceCase>;

type SurfaceName = keyof typeof SURFACES;

type DemoProps = Readonly<{
  mode: 'create' | 'update';
  surface: SurfaceName;
  locked: boolean;
  readOnly: boolean;
  /** Whether the protocol is translated, which puts a language switch on every option label. */
  translated: boolean;
}>;

function VariableEditorDemo({
  mode,
  surface,
  locked,
  readOnly,
  translated,
}: DemoProps) {
  const localization = translated ? ENGLISH_AND_SPANISH : ENGLISH;
  const [openId, setOpenId] = useState(1);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const held: SurfaceCase = SURFACES[surface];
  const authoritativeDocument: SectionDoc = {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: mode === 'update' ? { [held.variableId]: held.committed } : {},
  };
  // Every surface here is accepted by the host: the one story named for a
  // contradiction is refused by the editor's own analyser before a host is
  // reached. `VariableEditor.test.tsx` drives a host's refusal directly.
  const [submissions, setSubmissions] = useState(0);
  const answer = (): Promise<CodebookWriteOutcome> => {
    setSubmissions((count) => count + 1);
    return Promise.resolve({
      status: 'applied',
      sectionId: sectionId({ kind: 'codebookNode', typeId: PERSON }),
    });
  };
  const common = {
    openId,
    subject: SUBJECT,
    authoritativeDocument,
    onSubmitDocument: answer,
    onComplete: setCompletedId,
    readOnly,
  } as const;

  return (
    <ProtocolLocalizationProvider localization={localization}>
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <output aria-live="polite" className="text-muted">
            {completedId === null
              ? 'No accepted edit yet.'
              : `Accepted attribute id: ${completedId}`}
          </output>
          <output className="text-muted">
            {`Edits handed to the host: ${submissions}`}
          </output>
          <Button
            type="button"
            color="default"
            onClick={() => {
              setCompletedId(null);
              setOpenId((current) => current + 1);
            }}
          >
            Start a fresh open
          </Button>
        </div>
        {mode === 'create' ? (
          <VariableEditor
            {...common}
            mode="create"
            variableId={NEW_ATTRIBUTE}
            initialDraft={{
              name: locked ? 'biologicalSex' : '',
              type: 'categorical',
              options: [],
            }}
            protocolContext={contextIn(localization)}
            lockedOptions={locked ? LOCKED_OPTIONS : null}
          />
        ) : (
          <VariableEditor
            {...common}
            mode="update"
            variableId={held.variableId}
            initialDraft={held.draft}
          />
        )}
      </main>
    </ProtocolLocalizationProvider>
  );
}

const meta = {
  title: 'Protocol Builder/Codebook/Variable editor',
  component: VariableEditorDemo,
  parameters: {
    docs: {
      description: {
        component:
          'A host-neutral attribute editor holding its own draft. Change "openId" for every opening so a rapid close and reopen always starts with fresh form state.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    mode: 'create',
    surface: 'options',
    locked: false,
    readOnly: false,
    translated: false,
  },
} satisfies Meta<typeof VariableEditorDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A story that presses save and reads what comes back is pinned to English.
 *
 * The toolbar's Language control is what a reviewer switches to see which
 * strings a surface still hard-codes, and it applies to every story in the
 * Storybook — so a play asserting on an English sentence would fail for
 * anyone who had left the control on Español. Pinning the story's own locale
 * leaves the control free to do its job everywhere else.
 */
const inEnglish = { globals: { appLocale: 'en' } };

/** A custom property as it resolves on one element. */
const resolved = (element: Element, property: string): string =>
  getComputedStyle(element).getPropertyValue(property).trim();

/**
 * The destructive ink as each option field on a tinted row resolves it.
 *
 * The page's own destructive ink is too faint to read on the accent surface,
 * so the row points `--destructive-ink` at the accent surface's own
 * `--surface-accent-destructive`. An error on that row is boxed rather than
 * drawn in the ink, so what is painted with it there is the required-field
 * asterisk; `expectRequiredMarkInAccentInk` measures that paint.
 */
async function expectAccentInk(
  canvasElement: HTMLElement,
  fieldNames: readonly string[],
): Promise<void> {
  await expect(fieldNames.length).toBeGreaterThan(0);
  const pageInk = resolved(canvasElement, '--destructive-ink');
  for (const fieldName of fieldNames) {
    const region = canvasElement.querySelector(
      `[data-field-name="${fieldName}"] [aria-live]`,
    );
    if (region === null) {
      throw new Error(`no error region for the field "${fieldName}"`);
    }
    const ink = resolved(region, '--destructive-ink');
    await expect(ink).not.toBe('');
    await expect(ink).toBe(resolved(region, '--surface-accent-destructive'));
    await expect(ink).not.toBe(pageInk);
    // The fill a destructive control paints with is the page's own: only the
    // ink is redirected.
    await expect(resolved(region, '--destructive')).toBe(
      resolved(canvasElement, '--destructive'),
    );
  }
}

/** The colour `color` resolves to when it is set to this value beside `host`. */
const paintedColour = (host: Element, color: string): string => {
  const probe = document.createElement('span');
  probe.style.color = color;
  host.append(probe);
  const painted = getComputedStyle(probe).color;
  probe.remove();
  return painted;
};

/**
 * Each field's required-field asterisk, as it is painted, against probes
 * painted with the accent surface's destructive ink and the page's own.
 */
async function expectRequiredMarkInAccentInk(
  canvasElement: HTMLElement,
  fieldNames: readonly string[],
): Promise<void> {
  const pageInk = paintedColour(canvasElement, 'var(--destructive-ink)');
  for (const fieldName of fieldNames) {
    const field = canvasElement.querySelector(
      `[data-field-name="${fieldName}"]`,
    );
    if (field === null) throw new Error(`no field named "${fieldName}"`);
    const marks = [...field.querySelectorAll('[aria-hidden="true"]')].filter(
      (element) => element.textContent?.trim() === '*',
    );
    await expect(marks).toHaveLength(1);
    for (const mark of marks) {
      const accentInk = paintedColour(
        field,
        'var(--surface-accent-destructive)',
      );
      await expect(getComputedStyle(mark).color).toBe(accentInk);
      await expect(accentInk).not.toBe(pageInk);
    }
  }
}

export const NewCategoricalVariable: Story = {};

/**
 * An attribute whose choices are already written. Each option field sits on
 * a tinted row, and its required-field mark is drawn in the destructive ink
 * that row can carry, while the button that removes the option keeps the
 * page's destructive fill.
 */
export const ExistingVariable: Story = {
  args: { mode: 'update' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const removeButtons = await canvas.findAllByRole('button', {
      name: /^Remove option \d+$/,
    });
    await expect(removeButtons).toHaveLength(2);
    for (const button of removeButtons) {
      await expect(resolved(button, '--destructive')).toBe(
        resolved(canvasElement, '--destructive'),
      );
    }

    await expectAccentInk(canvasElement, [
      'option-1-label',
      'option-1-value',
      'option-2-label',
      'option-2-value',
    ]);
    await expectRequiredMarkInAccentInk(canvasElement, [
      'option-1-label',
      'option-1-value',
      'option-2-label',
      'option-2-value',
    ]);
  },
};

export const InterfaceOwnedOptions: Story = {
  args: { locked: true },
};

export const ReadOnly: Story = {
  args: { mode: 'update', readOnly: true },
};

/**
 * An attribute in a protocol written in two languages. The labels of its
 * options are written in each, through the language switch each option field
 * carries, and a field with no Spanish yet says so. The attribute's own label
 * is plain text, in no particular language.
 */
export const Translated: Story = {
  args: { mode: 'update', translated: true },
};

/**
 * The words on the two answers a boolean choice offers, and what happens when
 * only one of them is written.
 */
export const BooleanAnswers: Story = {
  args: { mode: 'update', surface: 'booleanAnswers' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A markdown box rather than an input — the interview renders an option
    // label as markdown wherever it shows one — so what it holds is its text.
    await expect(
      canvas.getByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveTextContent('I agree');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Save attribute' }),
    );

    await expect(
      await canvas.findByText(
        'Write what this answer says, or clear both to offer Yes and No.',
      ),
    ).toBeVisible();

    await expectAccentInk(canvasElement, [
      'boolean-answer-true-label',
      'boolean-answer-false-label',
    ]);
  },
};

/**
 * A yes/no attribute that offers more answers than the two this editor writes.
 *
 * The pair of fields is not offered for it: shown as the pair, the third
 * answer — a button a participant can already press — would be gone the moment
 * the attribute was saved for any other reason. The answers are shown as they
 * stand, and everything else about the attribute stays editable.
 */
export const HeldAnswers: Story = {
  args: { mode: 'update', surface: 'heldAnswers' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();
    await expect(
      canvas.getByRole('cell', { name: 'I would rather not say' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('textbox', { name: /attribute name/i }),
    ).toHaveValue('consent');
  },
};

/**
 * A yes/no attribute whose two answers both record `true`.
 *
 * Two answers, so the count is not what puts it here: the fieldset labels its
 * two fields by the boolean each one records, and this pair records one of
 * them twice. Drawn as the pair it could only be told apart by imposing
 * `true` and `false` on it, which would change what every answer already
 * given to the second button says.
 */
export const HeldAnswerValues: Story = {
  args: { mode: 'update', surface: 'heldAnswerValues' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole('textbox', { name: 'Label for “true”' }),
    ).toBeNull();
    await expect(
      canvas.getByRole('cell', { name: 'I agree, with conditions' }),
    ).toBeVisible();
    // The reason it is held, which is not the one a list of some other length
    // is given.
    await expect(
      canvas.getByText(/one recording “true” and the other “false”/),
    ).toBeVisible();
  },
};

/**
 * A date field's resolution and the two dates it is bounded by, opened on a
 * range that runs backwards.
 */
export const DateSettings: Story = {
  args: { mode: 'update', surface: 'dateSettings' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('combobox', { name: 'Date resolution' }),
    ).toHaveValue('full');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Save attribute' }),
    );

    await expect(
      await canvas.findByText(
        'The latest date cannot be earlier than the earliest date.',
      ),
    ).toBeVisible();
  },
};

/** The words a participant reads at each end of a sliding scale. */
export const ScaleSettings: Story = {
  args: { mode: 'update', surface: 'scaleSettings' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A markdown box rather than an input, so what it holds is its text.
    await expect(
      canvas.getByRole('textbox', { name: 'Minimum label' }),
    ).toHaveTextContent('Not at all close');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Save attribute' }),
    );

    await expect(
      await canvas.findByText('Write what the high end of the scale means.'),
    ).toBeVisible();
  },
};

/**
 * The one refusal shown in the words it arrived in, because they name the rule
 * and the values that cannot both hold.
 *
 * The words are the codebook schema's: the editor parses the whole entity
 * before it asks the host anything, and a rule its options can no longer
 * satisfy is refused there — so the sentence names the attribute, the rule and
 * both numbers. Everything else a refused save can raise is replaced by the
 * package's own copy for a save that did not happen, which is what the second
 * assertion is here to hold: "wait a moment and try again" is the wrong thing
 * to tell someone whose next save cannot succeed until they change something.
 *
 * The draft never leaves the editor: nothing is handed to the host or
 * accepted, focus goes to the refusal, and the researcher can still fix it and
 * save.
 */
export const RefusedByContradiction: Story = {
  args: { mode: 'update', surface: 'contradiction' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove option 3' }),
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Save attribute' }),
    );

    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent(
      'Attribute "preference": minSelected (3) is greater than the number of options (2)',
    );
    await expect(alert).not.toHaveTextContent('Wait a moment and try again');
    await expect(alert).toHaveFocus();
    await expect(canvas.getByText('No accepted edit yet.')).toBeVisible();
    await expect(canvas.getByText('Edits handed to the host: 0')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Save attribute' }),
    ).toBeEnabled();
  },
};
