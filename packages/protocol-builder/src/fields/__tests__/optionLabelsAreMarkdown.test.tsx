import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import VariableEditor, {
  type VariableEditorProps,
} from '../../codebook/components/VariableEditor.tsx';
import type { CodebookWriteOutcome } from '../../codebook/writes.ts';
import { createStageDraftProbe } from '../../form/__tests__/stageDraftProbe.tsx';
import Options, { optionsValidation } from '../../form/arrayFields/Options.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { richTextOf } from '../../testing/text.ts';
import BooleanAnswersField from '../BooleanAnswersField.tsx';

/**
 * Punctuation a researcher types into a label, chosen so that every character
 * is one markdown would READ if the label reached it unescaped.
 *
 * A leading `#` is a heading, a backtick pair is code, and both are text the
 * participant would be shown differently — or not at all. The asterisk and the
 * underscore are unpaired, which is how a researcher types one: paired, the
 * editor's own input rules turn them into the emphasis the researcher asked
 * for, and the value is emphasis rather than punctuation. Nothing here trips
 * an input rule, because a single-line document has no heading, list or code
 * to convert into.
 */
const PUNCTUATION = '# 5 * a day `tick` and _ this';

/**
 * A stored label whose punctuation is in the form markdown actually READS: a
 * pair around a word, which is emphasis the moment the escape stops being
 * written.
 *
 * Space-flanked, as the characters are above, `*` and `_` are literal to
 * CommonMark whether they are escaped or not — so a fixture of those alone
 * leaves the escape unasserted, and taking it out of the adapter passed every
 * test in this file. The pair cannot be TYPED into the editor (the input rule
 * turns it into the emphasis the researcher asked for) or pasted (a paste is
 * read as markdown), so this is a label that arrived from somewhere else — a
 * protocol written before these boxes existed, or by hand — and what is at
 * stake is the round trip that opening the row puts it through.
 *
 * The hyphen rides along: markdown reads it as nothing at all in the middle of
 * a word, so its source is the character itself.
 */
const PAIRED_SOURCE = '\\*stars\\* and \\_lines\\_ and 18-24';
const PAIRED_AS_READ = '*stars* and _lines_ and 18-24';

/** A label whose emphasis is authored, so a round trip has something to lose. */
const EMPHASISED = '**Very** close';

/** The same two words written with a combining accent instead of `é`. */
const DECOMPOSED = 'Trés proche';
const COMPOSED = 'Trés proche';

/**
 * What the participant reads for a stored label.
 *
 * The interview renders an option label through `RenderMarkdown`'s label
 * dialect wherever it shows one, and this is that dialect's own reading of the
 * string — so a label that lost its punctuation on the way through markdown
 * fails here rather than being described as "escaped correctly" by a test that
 * only read the bytes.
 */
const readByTheParticipant = (label: unknown): string =>
  getMarkdownLabelText(typeof label === 'string' ? label : '');

/**
 * Bold and italic, and nothing a single line cannot hold.
 *
 * Asked of the toolbar beside ONE label box rather than of the page, because
 * a surface may show several at once and a page-wide query would answer with
 * somebody else's.
 */
function expectBoldAndItalicOnly(field: HTMLElement): void {
  const cell = within(field);
  expect(cell.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  expect(cell.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
  expect(cell.queryByRole('button', { name: 'Heading 1' })).toBeNull();
  expect(cell.queryByRole('button', { name: 'Heading 2' })).toBeNull();
  expect(cell.queryByRole('button', { name: 'Bullet list' })).toBeNull();
  expect(cell.queryByRole('button', { name: 'Numbered list' })).toBeNull();
  expect(cell.queryByRole('button', { name: 'Thematic break' })).toBeNull();
  expect(cell.queryByRole('button', { name: 'Add link' })).toBeNull();
  // The promise about the value itself, which is what the withheld controls
  // follow from: a screen reader is told Enter does nothing here.
  expect(cell.getByRole('textbox')).toHaveAttribute('aria-multiline', 'false');
}

/** The field wrapper around one control, which is where its own errors go. */
function fieldNamed(name: string): HTMLElement {
  const field = document.querySelector<HTMLElement>(
    `[data-field-name="${name}"]`,
  );
  if (field === null) throw new Error(`no field named ${name} is on screen`);
  return field;
}

// ───────────────────────────── the codebook's own attribute editor

const SUBJECT = { entity: 'node', type: 'person' } as const;
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });
const APPLIED: CodebookWriteOutcome = {
  status: 'applied',
  sectionId: PERSON_SECTION,
};
const personDocument = (
  variables: Readonly<Record<string, unknown>> = {},
): SectionDoc => ({
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables,
});

type SubmitDocument = (document: SectionDoc) => Promise<CodebookWriteOutcome>;

/**
 * The codebook editor over an attribute that already holds these options,
 * which is the surface a researcher reaches through Codebook → Edit attribute.
 */
function renderAttributeEditor(
  options: readonly Readonly<Record<string, unknown>>[],
) {
  const onSubmitDocument = vi.fn<SubmitDocument>(async () => APPLIED);
  const committed = { name: 'closeness', type: 'ordinal', options };
  const props: VariableEditorProps = {
    openId: 'open-1',
    mode: 'update',
    subject: SUBJECT,
    authoritativeDocument: personDocument({ closeness: committed }),
    variableId: 'closeness',
    initialDraft: committed,
    onSubmitDocument,
    onComplete: () => undefined,
  };
  render(<VariableEditor {...props} />);

  return {
    user: userEvent.setup(),
    onSubmitDocument,
    /** The options the save handed to the codebook. */
    async saved(): Promise<readonly Readonly<Record<string, unknown>>[]> {
      await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledTimes(1));
      const document = onSubmitDocument.mock.calls[0]?.[0];
      const variables = document?.variables;
      const variable =
        typeof variables === 'object' && variables !== null
          ? Reflect.get(variables, 'closeness')
          : undefined;
      const written =
        typeof variable === 'object' && variable !== null
          ? Reflect.get(variable, 'options')
          : undefined;
      if (!Array.isArray(written)) {
        throw new Error('the save wrote no options at all');
      }
      return written as readonly Readonly<Record<string, unknown>>[];
    },
  };
}

const attributeLabelField = (position: number) =>
  fieldNamed(`option-${position}-label`);

const attributeLabelBox = (position: number) =>
  screen.getByRole('textbox', { name: `Option ${position} label` });

describe('the codebook’s own attribute editor', () => {
  it('offers bold and italic on an option label, and nothing else', () => {
    renderAttributeEditor([{ label: 'Distant', value: 'distant' }]);

    expectBoldAndItalicOnly(attributeLabelField(1));
  });

  it('leaves punctuation the researcher typed as punctuation', async () => {
    const { user, saved } = renderAttributeEditor([
      { label: 'Distant', value: 'distant' },
      { label: 'Close', value: 'close' },
    ]);

    await user.clear(attributeLabelBox(1));
    await user.type(attributeLabelBox(1), PUNCTUATION);
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    const written = await saved();
    expect(readByTheParticipant(written[0]?.label)).toBe(PUNCTUATION);
  });

  /**
   * The characters markdown would read as emphasis, pasted whole.
   *
   * And the hyphen beside them, which markdown reads as nothing at all in the
   * middle of a word: escaped there, an age band was stored as `18\\-24` and
   * shown that way by every read-only list that displays the stored source.
   */
  it('carries a markdown pair, and a hyphen, through the round trip unchanged', async () => {
    const { user, saved } = renderAttributeEditor([
      { label: PAIRED_SOURCE, value: 'starred' },
      { label: 'Close', value: 'close' },
    ]);

    // What the participant reads, before anything is saved: the characters,
    // not emphasis.
    expect(richTextOf(attributeLabelBox(1))).toBe(PAIRED_AS_READ);

    // Typed INTO rather than merely looked at, because a label nobody edited
    // is carried through as it arrived — it is the re-serialisation of an
    // edited one that has to put every escape back. Where in the line the
    // typing lands is jsdom's business, so what is asserted is the
    // punctuation around it rather than the whole string.
    await user.click(attributeLabelBox(1));
    await user.type(attributeLabelBox(1), '65+');

    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    const written = await saved();
    const stored = String(written[0]?.label ?? '');
    // The stored source keeps the escape that holds the pair apart from
    // emphasis the researcher never asked for, and does NOT escape a hyphen
    // markdown reads as nothing — which is what stored `18\\-24` and showed it
    // that way in every read-only list.
    expect(stored).toContain('\\*stars\\*');
    expect(stored).toContain('\\_lines\\_');
    expect(stored).toContain('18-24');
    expect(stored).not.toContain('18\\-24');
    // And the participant still reads the characters rather than emphasis.
    expect(readByTheParticipant(stored)).toContain(PAIRED_AS_READ);
  });

  it('saves a label authored elsewhere exactly as it was written', async () => {
    const { user, saved } = renderAttributeEditor([
      { label: EMPHASISED, value: 'very' },
      { label: 'Distant', value: 'distant' },
    ]);

    // The label is shown as the participant will read it, not as its source.
    expect(richTextOf(attributeLabelBox(1))).toBe('Very close');

    // Something else about the attribute changes, so there is a save to make
    // at all — and the label it carries is the one it arrived with.
    const name = screen.getByRole('textbox', { name: /attribute name/i });
    await user.clear(name);
    await user.type(name, 'closeness_2');
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    expect((await saved())[0]?.label).toBe(EMPHASISED);
  });

  it('stores a label in canonical form however it was typed', async () => {
    const { user, saved } = renderAttributeEditor([
      { label: 'Distant', value: 'distant' },
      { label: 'Close', value: 'close' },
    ]);

    await user.clear(attributeLabelBox(1));
    await user.type(attributeLabelBox(1), DECOMPOSED);
    await user.click(screen.getByRole('button', { name: 'Save attribute' }));

    const written = await saved();
    expect(written[0]?.label).toBe(COMPOSED);
    expect(written[0]?.label).not.toBe(DECOMPOSED);
  });

  it('says which labels a participant could not tell apart', async () => {
    const { user } = renderAttributeEditor([
      { label: 'Close', value: 'close' },
      { label: 'Distant', value: 'distant' },
    ]);

    await user.clear(attributeLabelBox(2));
    await user.type(attributeLabelBox(2), 'close');

    await waitFor(() =>
      expect(attributeLabelField(2)).toHaveTextContent('Labels must be unique'),
    );
  });
});

// ───────────────────────────── the inline list a row mounts

/** A stage the schema accepts, so nothing here is refused for its shape. */
const SAVEABLE_STAGE = { label: 'Welcome', title: 'Welcome', items: [] };

/**
 * The list a form-field, composer, bin or tie-strength row mounts under its
 * attribute picker — one component (`arrayFields/Options`) at all four.
 */
function renderInlineList(options: readonly unknown[]) {
  const { probe, draft } = createStageDraftProbe();
  const harness = renderStageEditor({
    stage: { type: 'Information', fields: { ...SAVEABLE_STAGE, options } },
    sections: (
      <BuilderSection title="Answer options">
        {probe}
        <Field
          name="options"
          label="Answer options"
          component={Options}
          addButtonLabel="Create new option"
          {...optionsValidation}
        />
      </BuilderSection>
    ),
  });

  return {
    user: harness.user,
    /** The labels the next save would write, in order. */
    labels: () =>
      (Array.isArray(draft().options)
        ? (draft().options as unknown[])
        : []
      ).map((option) =>
        typeof option === 'object' && option !== null
          ? Reflect.get(option, 'label')
          : undefined,
      ),
  };
}

const rowLabelBox = () => screen.getByRole('textbox', { name: 'Label' });

describe('the inline list a row mounts', () => {
  it('offers bold and italic on an option label, and nothing else', async () => {
    const { user } = renderInlineList([{ label: 'Close', value: 'close' }]);

    await user.click(
      await screen.findByRole('button', { name: 'Edit option 1' }),
    );
    await screen.findByRole('textbox', { name: 'Label' });

    expectBoldAndItalicOnly(fieldNamed('options[0].label'));
  });

  it('leaves punctuation the researcher typed as punctuation', async () => {
    const { user, labels } = renderInlineList([
      { label: 'Close', value: 'close' },
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Label' }),
      PUNCTUATION,
    );

    await waitFor(() =>
      expect(readByTheParticipant(labels()[1])).toBe(PUNCTUATION),
    );
  });

  it('leaves a label alone when the row is only opened and closed', async () => {
    const { user, labels } = renderInlineList([
      { label: EMPHASISED, value: 'very' },
      { label: 'Distant', value: 'distant' },
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'Edit option 1' }),
    );
    expect(richTextOf(rowLabelBox())).toBe('Very close');
    await user.click(
      screen.getByRole('button', { name: 'Finish editing option' }),
    );

    expect(labels()).toEqual([EMPHASISED, 'Distant']);
  });

  /**
   * A label authored before labels were stored canonically is not an edit.
   *
   * The value is read canonically as well as written canonically, so opening a
   * row holding a decomposed accent does not rewrite the whole list — which
   * would dirty the stage, and add a draft timeline entry, for a row the
   * researcher only looked at.
   */
  it('does not rewrite a label whose accent was composed differently', async () => {
    const { user, labels } = renderInlineList([
      { label: DECOMPOSED, value: 'very' },
      { label: 'Distant', value: 'distant' },
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'Edit option 1' }),
    );
    await screen.findByRole('textbox', { name: 'Label' });

    expect(labels()).toEqual([DECOMPOSED, 'Distant']);
  });

  it('stores a label in canonical form however it was typed', async () => {
    const { user, labels } = renderInlineList([
      { label: 'Close', value: 'close' },
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Label' }),
      DECOMPOSED,
    );

    await waitFor(() => expect(labels()[1]).toBe(COMPOSED));
    expect(labels()[1]).not.toBe(DECOMPOSED);
  });

  it('says which labels a participant could not tell apart', async () => {
    const { user } = renderInlineList([{ label: 'Close', value: 'close' }]);

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Label' }),
      'close',
    );

    await waitFor(() =>
      expect(fieldNamed('options[1].label')).toHaveTextContent(
        'Labels must be unique',
      ),
    );
  });
});

// ───────────────────────────── the two answers of a yes-or-no attribute

const TRUE_ANSWER = 'boolean-answer-true-label';

/** The words on the two buttons a yes-or-no question puts on screen. */
function renderBooleanAnswers(options: readonly unknown[]) {
  const { probe, draft } = createStageDraftProbe();
  const harness = renderStageEditor({
    stage: { type: 'Information', fields: { ...SAVEABLE_STAGE, options } },
    sections: (
      <BuilderSection title="Answer labels">
        {probe}
        <Field
          name="options"
          label="Answer labels"
          component={BooleanAnswersField}
        />
      </BuilderSection>
    ),
  });

  return {
    user: harness.user,
    labels: () =>
      (Array.isArray(draft().options)
        ? (draft().options as unknown[])
        : []
      ).map((option) =>
        typeof option === 'object' && option !== null
          ? Reflect.get(option, 'label')
          : undefined,
      ),
  };
}

const answerBox = (records: 'true' | 'false') =>
  screen.getByRole('textbox', { name: `Label for “${records}”` });

describe('the two answers of a yes-or-no attribute', () => {
  it('offers bold and italic on an answer’s words, and nothing else', async () => {
    renderBooleanAnswers([
      { label: 'Related', value: true },
      { label: 'Not related', value: false },
    ]);

    await screen.findByRole('textbox', { name: 'Label for “true”' });

    expectBoldAndItalicOnly(fieldNamed(TRUE_ANSWER));
  });

  it('leaves punctuation the researcher typed as punctuation', async () => {
    const { user, labels } = renderBooleanAnswers([
      { label: 'Related', value: true },
      { label: 'Not related', value: false },
    ]);

    await screen.findByRole('textbox', { name: 'Label for “true”' });
    await user.clear(answerBox('true'));
    await user.type(answerBox('true'), PUNCTUATION);

    await waitFor(() =>
      expect(readByTheParticipant(labels()[0])).toBe(PUNCTUATION),
    );
  });

  it('leaves the pair alone when nothing about it is touched', async () => {
    const { labels } = renderBooleanAnswers([
      { label: EMPHASISED, value: true },
      { label: 'Distant', value: false },
    ]);

    const box = await screen.findByRole('textbox', {
      name: 'Label for “true”',
    });
    expect(richTextOf(box)).toBe('Very close');

    expect(labels()).toEqual([EMPHASISED, 'Distant']);
  });

  it('stores an answer in canonical form however it was typed', async () => {
    const { user, labels } = renderBooleanAnswers([
      { label: 'Related', value: true },
      { label: 'Not related', value: false },
    ]);

    await screen.findByRole('textbox', { name: 'Label for “true”' });
    await user.clear(answerBox('true'));
    await user.type(answerBox('true'), DECOMPOSED);

    await waitFor(() => expect(labels()[0]).toBe(COMPOSED));
    expect(labels()[0]).not.toBe(DECOMPOSED);
  });

  /**
   * Emphasis a researcher types becomes emphasis, not four asterisks.
   *
   * The editor's own input rules convert `**Very**` as it is typed, so what the
   * protocol holds is a bold run — and the serializer writes it back as the
   * markdown it came from rather than escaping the characters. This is the
   * claim the sample protocol depends on: its consent answers read
   * `**Yes**. I wish to participate…`, and a surface that escaped them would
   * put four literal asterisks in front of the participant.
   */
  it('turns emphasis the researcher types into the markdown it holds', async () => {
    const { user, labels } = renderBooleanAnswers([
      { label: 'Related', value: true },
      { label: 'Not related', value: false },
    ]);

    await screen.findByRole('textbox', { name: 'Label for “true”' });
    await user.clear(answerBox('true'));
    await user.type(answerBox('true'), EMPHASISED);

    await waitFor(() => expect(labels()[0]).toBe(EMPHASISED));
  });

  /**
   * The pair keeps its OWN uniqueness rule rather than the option list's.
   *
   * Two buttons with the same words cannot be told apart, which is the same
   * harm — but it is judged case-SENSITIVELY here, because "Yes" and "yes" are
   * two buttons a participant can read apart while a categorical option's
   * label is compared the way its exported value is. `validateBooleanAnswers`
   * says why; this is the claim that it still holds once the words are
   * markdown.
   */
  it('still refuses two answers written the same way', async () => {
    const { user } = renderBooleanAnswers([
      { label: 'Related', value: true },
      { label: 'Not related', value: false },
    ]);

    await screen.findByRole('textbox', { name: 'Label for “true”' });
    await user.clear(answerBox('false'));
    await user.type(answerBox('false'), 'Related');

    await waitFor(() =>
      expect(fieldNamed('boolean-answer-false-label')).toHaveTextContent(
        'Give this answer different words',
      ),
    );
  });
});
