import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

import {
  packageSource,
  sourceFiles,
  sourcePath,
} from '../../../__tests__/packageSource.ts';
import { categoricalBinStageEditor } from '../../../editors/categorical-bin/CategoricalBinStageEditor.ts';
import { shimMarkdownEditorMeasurement } from '../../../editors/family-pedigree/__tests__/editorFixtures.ts';
import enCatalog from '../../../locales/en.json';
import { ruleSections } from '../../../rules/__tests__/fixtures.ts';
import { RuleEditorHost } from '../../../rules/__tests__/ruleEditorHost.tsx';
import RuleEditorDialog, {
  type RuleTypeOption,
} from '../../../rules/RuleEditorDialog.tsx';
import { ruleSetTargets } from '../../../rules/ruleSet.ts';
import {
  attributeField,
  inventAttribute,
  offersCreation,
  openAttributePicker,
} from '../../../testing/attributePicker.ts';
import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';

/** See each editor's own test for why the rich-text editor is stood in for. */
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

shimMarkdownEditorMeasurement();

/* -------------------------------------------------------------------------- */
/* §3.1 criterion 12: no create control sits beside a picker                   */
/* -------------------------------------------------------------------------- */

/**
 * The words this package uses for inventing an attribute a slot is asking for.
 *
 * Every one of the fourteen slots that offers creation phrases it the same
 * way — "Create a new position attribute", "Create a new location attribute" —
 * because every one of them is the same act: this slot needs an attribute of
 * one kind, and the codebook has none to bind. Until this branch those words
 * were on a `CreateVariableButton` standing next to the picker; they are now
 * the title of the dialog the picker's own create row escalates to, and a
 * dialog title is not a control.
 *
 * So the phrase is the thing to look for, and where it is found decides
 * whether the defect is back: as a CONTROL outside the picker's window it is a
 * sibling create control, and nothing else it can be.
 *
 * It is read out of the extraction catalog by that phrase rather than typed
 * here, so the fourteen slots are covered by the words they actually ship
 * rather than by a copy of them; the two lists below are what keep the
 * reading honest.
 */
const INVENT_PHRASE = /^Create a new\b.*\battribute\b/;

/**
 * The create title of every slot that offers creation, by message id.
 *
 * Written out because these are what the sweep has to be able to see: a slot
 * whose title was reworded out of the phrase would leave that slot unguarded,
 * and nothing else would say so. Nineteen titles for the fourteen picker
 * mounts the eight converted sections hold, because three of the labels are
 * shared by two mounts each.
 */
const SLOT_INVENT_LABEL_IDS = [
  'protocolBuilder.censusPrompts.attributeCreateLabel',
  'protocolBuilder.censusPrompts.categoricalBinOtherAttributeCreateLabel',
  'protocolBuilder.censusPrompts.tieStrengthScaleCreateLabel',
  'protocolBuilder.geospatial.createAttributeLabel',
  'protocolBuilder.networkCanvas.composerCreateLayoutLabel',
  'protocolBuilder.networkCanvas.createHullLabel',
  'protocolBuilder.networkCanvas.createQuickAddLabel',
  'protocolBuilder.networkCanvas.presetCreateLayoutLabel',
  'protocolBuilder.networkCanvas.promptCreateHighlightLabel',
  'protocolBuilder.networkCanvas.promptCreateLayoutLabel',
  'protocolBuilder.pedigree.edgeGameteRoleCreateLabel',
  'protocolBuilder.pedigree.edgeGestationalCarrierCreateLabel',
  'protocolBuilder.pedigree.edgeIsActiveCreateLabel',
  'protocolBuilder.pedigree.edgeRelationshipTypeCreateLabel',
  'protocolBuilder.pedigree.nodeBiologicalSexCreateLabel',
  'protocolBuilder.pedigree.nodeEgoCreateLabel',
  'protocolBuilder.pedigree.nodeLabelCreateLabel',
  'protocolBuilder.pedigree.nodeRelationshipCreateLabel',
  'protocolBuilder.pedigree.nominationCreateLabel',
] as const;

/**
 * Messages phrased the same way that are not one of the nineteen titles above,
 * each one read and accounted for.
 *
 * The sweep covers their words like any others — `inventLabels` reads the
 * catalog, not this file — so what this list does is record that somebody has
 * decided what each of them is, rather than leave the sweep reporting a
 * message nobody has looked at.
 *
 * - `formFields.createNewOption` names the sentinel row the form-field
 *   picker used to offer INSIDE its own window, which is where creation
 *   belongs; it is left out of the sweep by being inside the window rather
 *   than by being named here, and it is going with the sentinel.
 * - `networkCanvas.formFieldVariableCreateTitle` titles the codebook editor a
 *   network composer form field's create row opens. That row is landing on
 *   this branch (spec §3.1's remaining work), and its slot is not one of the
 *   nineteen until it does.
 *
 * An entry may be absent — one of these two is being removed and the other
 * added while this is written — so the check below is a subset rather than an
 * equality.
 */
const ALSO_ACCOUNTED_FOR = [
  'protocolBuilder.formFields.createNewOption',
  'protocolBuilder.networkCanvas.formFieldVariableCreateTitle',
] as const;

const catalog = enCatalog as Record<string, { defaultMessage: string }>;

/** The ids whose English says "Create a new … attribute". */
const phrasedAsInventing = (): string[] =>
  Object.entries(catalog)
    .filter(([, message]) => INVENT_PHRASE.test(message.defaultMessage))
    .map(([id]) => id)
    .toSorted();

/**
 * The words the sweep looks for: every one the catalog phrases that way, read
 * from the catalog rather than from the list above.
 *
 * So a label added to the package is swept for from the moment it ships, and
 * the lists above are what say whether anybody has looked at it.
 */
const inventLabels = (): readonly string[] =>
  phrasedAsInventing().map((id) => {
    const message = catalog[id];
    if (message === undefined) {
      throw new Error(`The catalog lost the message "${id}" mid-read.`);
    }
    return message.defaultMessage;
  });

const collapse = (text: string) => text.replaceAll(/\s+/gu, ' ').trim();

/**
 * Every control on screen right now that offers to invent an attribute and is
 * NOT inside the picker's window.
 *
 * The window is excluded by its own marker rather than by role, for the reason
 * `testing/attributePicker.ts` gives: a picker opened from a row dialog puts
 * one dialog on top of another, and the accessibility tree shows both. Inside
 * that marker, an invent affordance is the create row — which is where spec
 * §3.1 says it belongs. Outside it, it is the sibling control this criterion
 * forbids.
 *
 * `AttributeCodebookControls`' buttons — "Create this attribute and its
 * values", "Create this attribute and what it accepts", "Change this
 * attribute's values", "Set rules for this answer" — sit outside the window
 * too, and are deliberately not among these: they are the codebook's own
 * surfaces for the attribute a row has ALREADY chosen or is already inventing,
 * which is the picker's escalation path rather than a second way in. The
 * package's wording marks the difference exactly — "this attribute" for the
 * one in hand, "a new … attribute" for one that does not exist — so the phrase
 * above separates them without an exception list.
 */
const inventControls = (): HTMLElement[] => {
  const wanted = new Set(inventLabels());
  const candidates = [
    ...screen.queryAllByRole('button'),
    ...screen.queryAllByRole('option'),
    ...screen.queryAllByRole('menuitem'),
  ];
  return candidates.filter((control) => {
    if (control.closest('[data-variable-spotlight]') !== null) return false;
    const label = control.getAttribute('aria-label');
    return wanted.has(collapse(label ?? control.textContent ?? ''));
  });
};

const describeControls = (controls: readonly HTMLElement[]): string =>
  JSON.stringify(
    controls.map(
      (control) =>
        control.getAttribute('aria-label') ??
        collapse(control.textContent ?? ''),
    ),
  );

const expectNoInventControl = (where: string): void => {
  const found = inventControls();
  expect(
    found,
    `${where} offers to invent an attribute from a control outside the picker's window: ${describeControls(found)}. Creation belongs on the picker's own create row (spec §3.1 criterion 12).`,
  ).toEqual([]);
};

/**
 * How many attribute pickers the sweep below reaches in each editor: the ones
 * a stage's own sections mount, plus the ones inside each row's dialog.
 *
 * Written out rather than counted at run time, because it is what stops the
 * sweep from passing by seeing nothing. A row dialog that stopped opening, or
 * a section that stopped mounting its picker, would otherwise leave the
 * criterion checked against an empty page — which is how a guard over
 * nineteen editors comes to guard nothing.
 *
 * These are the pickers a researcher reaches without turning anything on. The
 * optional sections the fixture leaves switched off hold four more — the two
 * rule-builder pickers behind a stage filter or skip logic, the network
 * composer's node-attribute form, the pedigree's family-member form — and the
 * two rule-builder ones are the creation-free sites tested in their own right
 * below.
 */
const PICKERS_REACHED: Readonly<Record<string, number>> = {
  'alter-edge-form-1': 1,
  'alter-form-1': 2,
  'anonymisation-1': 0,
  'categorical-bin-1': 1,
  'dyad-census-1': 0,
  'ego-form-1': 1,
  'family-pedigree-1': 9,
  'geospatial-1': 1,
  'information-1': 0,
  'name-generator-1': 1,
  'name-generator-quick-add-1': 1,
  'name-generator-roster-1': 0,
  'narrative-1': 2,
  'narrative-pedigree-1': 1,
  'network-composer-1': 3,
  'one-to-many-dyad-census-1': 0,
  'ordinal-bin-1': 1,
  'sociogram-1': 3,
  'tie-strength-census-1': 1,
};

const pickerTriggersIn = (scope: ParentNode): number =>
  scope.querySelectorAll('button[data-field-focus-target]').length;

/** The row-editing affordance `form/rowDialog.tsx` puts on every row. */
const rowEditButtons = (): HTMLElement[] =>
  screen
    .queryAllByRole('button')
    .filter((button) =>
      (button.getAttribute('aria-label') ?? '').startsWith('Edit '),
    );

const openRowDialog = async (
  harness: ReturnType<typeof renderStageEditor>,
  button: HTMLElement,
): Promise<HTMLElement> => {
  await harness.user.click(button);
  return waitFor(() => {
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    const [dialog] = dialogs;
    if (dialog === undefined) throw new Error('the row dialog did not open');
    return dialog;
  });
};

/**
 * Closes a row dialog, answering the discard confirmation where there is one.
 *
 * A row dialog opens on the row EXPANDED — a content block's value moved into
 * the slot its kind names, a prompt's list normalised — so some of them are
 * dirty before the researcher touches anything, and dismissing those asks
 * before throwing the draft away. Nothing here is saved, so the answer is
 * always to discard.
 */
const closeRowDialog = async (
  harness: ReturnType<typeof renderStageEditor>,
): Promise<void> => {
  await harness.user.keyboard('{Escape}');
  const discardName = 'Discard changes';
  await waitFor(() => {
    if (screen.queryAllByRole('dialog').length === 0) return;
    if (screen.queryByRole('button', { name: discardName }) === null) {
      throw new Error('the row dialog is still open');
    }
  });
  const discard = screen.queryByRole('button', { name: discardName });
  if (discard === null) return;
  await harness.user.click(discard);
  await waitFor(() => {
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });
};

describe('no create control sits beside an attribute picker', () => {
  /**
   * The phrase the sweep looks for is the phrase the package ships, and
   * somebody has read every message it finds.
   *
   * Two claims, because they fail for opposite reasons. A slot's title
   * reworded out of the phrase leaves that slot swept for words nothing says
   * any more — the second assertion. A message newly phrased that way is one
   * nobody has decided about: it may be another slot's title, in which case it
   * belongs in the list above and in the sweep, or it may be something else,
   * in which case it has to be read before it is excused — the first.
   */
  it('knows every way the package says “invent an attribute”', () => {
    const accounted = new Set<string>([
      ...SLOT_INVENT_LABEL_IDS,
      ...ALSO_ACCOUNTED_FOR,
    ]);
    expect(
      phrasedAsInventing().filter((id) => !accounted.has(id)),
      'a message says “Create a new … attribute” and this guard has never been told what it is for',
    ).toEqual([]);

    const found = new Set(phrasedAsInventing());
    expect(
      SLOT_INVENT_LABEL_IDS.filter((id) => !found.has(id)),
      'a slot’s create title is no longer phrased the way the sweep looks for, so that slot is unguarded',
    ).toEqual([]);
  });

  /**
   * And no editor offers those words on a control of its own.
   *
   * Every stage's sections, and every row dialog they hold, because that is
   * where the eight converted sections put their button: a geospatial prompt's
   * attribute is chosen inside the prompt's own dialog, and a sweep that only
   * read the page behind it would have walked past the button it is looking
   * for.
   */
  it.each(fixtureStageIds())(
    'offers creation only from inside the picker in %s',
    async (stageId) => {
      const harness = renderStageEditor({ stageId });
      await harness.opened();
      await screen.findByRole('textbox', { name: 'Stage name' });

      expectNoInventControl(`The ${stageId} editor`);
      let reached = pickerTriggersIn(document.body);

      const rows = rowEditButtons().length;
      for (let index = 0; index < rows; index += 1) {
        const button = rowEditButtons()[index];
        if (button === undefined) {
          throw new Error(
            `The ${stageId} editor had ${rows} rows to open and lost one at ${index}.`,
          );
        }
        const rowLabel = button.getAttribute('aria-label') ?? '';
        const dialog = await openRowDialog(harness, button);
        reached += pickerTriggersIn(dialog);
        expectNoInventControl(`“${rowLabel}” in the ${stageId} editor`);
        await closeRowDialog(harness);
      }

      expect(
        reached,
        `The sweep of the ${stageId} editor reached ${reached} attribute pickers rather than the ${PICKERS_REACHED[stageId] ?? 0} it holds, so the criterion was checked against the wrong page.`,
      ).toBe(PICKERS_REACHED[stageId]);
    },
  );

  /**
   * And no interface's editor can reopen the codebook's attribute editor,
   * whatever a new control were called.
   *
   * The sweep above reads words, and a sibling control could be given other
   * ones. This reads the seam instead. The escalation dialog is
   * `useCreateVariableEditor`'s, and the eight sections that used to carry a
   * button reached it directly; they reach it through
   * `useCreateAttributeForSlot` now, which answers with the props a picker
   * takes and nothing a section can press. So no module under `editors/`
   * names either the hook or the editor — a section that regained a control
   * of its own would have to.
   *
   * Scoped to `editors/` because the two shared sections outside it reach the
   * editor for a reason this criterion is not about:
   * `sections/AttributeCodebookControls.tsx` mounts it for the attribute a row
   * has ALREADY chosen or is already inventing, which is the picker's
   * escalation path rather than a second way in, and the form-field rows ask
   * the codebook for the KIND of answer as well as the name, which only that
   * editor has a control for. Both hand what they open to the picker, and the
   * sweep above is what holds them to it.
   */
  it('lets no interface editor reach the codebook’s attribute editor directly', () => {
    const namedIn = (area: string, specifier: RegExp): string[] =>
      sourceFiles()
        .map(sourcePath)
        .filter(
          (path) =>
            path.startsWith(area) &&
            specifier.test(readFileSync(join(packageSource, path), 'utf8')),
        )
        .toSorted();

    expect(namedIn('editors/', /useCreateVariableEditor/u)).toEqual([]);
    expect(
      namedIn('editors/', /codebook\/components\/VariableEditor\.tsx/u),
    ).toEqual([]);

    // And the editor itself is mounted in exactly the two places above, so a
    // third module cannot become a way in without this failing.
    expect(
      namedIn('', /from '[^']*codebook\/components\/VariableEditor\.tsx'/u),
    ).toEqual([
      'sections/AttributeCodebookControls.tsx',
      'sections/create-variable/useCreateVariableEditor.tsx',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* The four sites Architect refused creation at                                */
/* -------------------------------------------------------------------------- */

/**
 * What a picker that cannot create says in its own search box.
 *
 * Read as well as the create row, because it is the other half of the same
 * fact and it is read from the other side: the placeholder is chosen from
 * whether `onCreate` was given at all, so a site that started passing
 * `onCreateOption` would invite the researcher to "find or create" here before
 * they had typed anything.
 */
const SEARCH_ONLY_PLACEHOLDER = 'Find an attribute…';

const expectCreationFree = async (
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  site: string,
): Promise<void> => {
  expect(
    await offersCreation(user, field),
    `${site} offers a create row. Architect refused creation here, so the package does too.`,
  ).toBe(false);

  const dialog = await openAttributePicker(user, field);
  expect(
    within(dialog).getByRole('searchbox', {
      name: 'Find or create an attribute',
    }),
    `${site} invites the researcher to create an attribute in its search box.`,
  ).toHaveAttribute('placeholder', SEARCH_ONLY_PLACEHOLDER);
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(document.body.querySelector('[data-variable-spotlight]')).toBeNull();
  });
};

const RULE_TYPES: readonly RuleTypeOption[] = [
  {
    label: 'Node - match a node type or one of its attributes.',
    value: 'node',
  },
  { label: 'Ego - match one of the ego attributes.', value: 'ego' },
];

/** The rule builder, open on a new rule, inside a real stage editor. */
const renderRuleEditor = () => {
  const user = userEvent.setup();
  render(
    <RuleEditorHost
      sections={ruleSections()}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      <RuleEditorDialog
        open
        seed={{ type: '' }}
        ruleTypes={RULE_TYPES}
        allowedTargets={ruleSetTargets('query')}
        onSave={() => undefined}
        onCancel={() => undefined}
      />
    </RuleEditorHost>,
  );
  return user;
};

describe('the sites Architect refused creation at stay creation-free', () => {
  /**
   * A rule is a question about data a protocol already collects, so inventing
   * an attribute from inside one would build a rule against an attribute
   * nothing has ever written — always unanswered, for every participant.
   * Architect said so with `disallowCreation` at `Query/Rules/RuleEditor.tsx:540`
   * (ego) and `:654` (node and edge).
   */
  it('refuses creation on a rule’s ego attribute', async () => {
    const user = renderRuleEditor();

    await user.click(
      screen.getByRole('radio', {
        name: 'Ego - match one of the ego attributes.',
      }),
    );

    await expectCreationFree(
      user,
      await waitFor(() => attributeField('Ego attribute')),
      'The rule builder’s ego attribute',
    );
  });

  it('refuses creation on a rule’s node attribute', async () => {
    const user = renderRuleEditor();

    await user.click(
      screen.getByRole('radio', {
        name: 'Node - match a node type or one of its attributes.',
      }),
    );
    await user.click(await screen.findByRole('radio', { name: 'Person' }));
    await user.click(await screen.findByRole('option', { name: /Attribute/ }));

    await expectCreationFree(
      user,
      await waitFor(() => attributeField('Node attribute')),
      'The rule builder’s node attribute',
    );
  });

  /**
   * A narrative preset GROUPS the people on the canvas by an answer they have
   * already given, so a fresh attribute would draw one hull holding everybody.
   * Architect passed `disallowCreation` at `NarrativePresets/PresetFields.tsx:231`.
   *
   * The position attribute in the same dialog is read first, and offers
   * creation: it is what proves the reading below is a fact about this slot
   * rather than about a window that never draws a create row.
   */
  it('refuses creation on a narrative preset’s grouping attribute, beside a slot that offers it', async () => {
    const harness = renderStageEditor({ stageId: 'narrative-1' });
    await harness.opened();
    const dialog = await openRowDialog(
      harness,
      screen.getByRole('button', { name: 'Edit preset' }),
    );

    expect(
      await offersCreation(
        harness.user,
        attributeField('Layout attribute', dialog),
      ),
      'The narrative preset’s position attribute stopped offering creation, so the grouping attribute’s reading below proves nothing.',
    ).toBe(true);

    await expectCreationFree(
      harness.user,
      attributeField('Grouping attribute', dialog),
      'The narrative preset’s grouping attribute',
    );
  });

  /**
   * A disease only READS its attribute — which family members are marked as
   * affected — so a bare new one would mark nobody, and the condition a study
   * does not record yet is added where it IS recorded, as a nomination prompt
   * of the source pedigree. Architect's `NarrativePedigree/DiseaseFields.tsx:198`
   * passes neither `onCreateOption` nor `disallowCreation`, so it draws a
   * create row that clears the field and writes nothing; the package does not
   * port a dead affordance.
   */
  it('refuses creation on a narrative pedigree’s affected-status attribute', async () => {
    const harness = renderStageEditor({ stageId: 'narrative-pedigree-1' });
    await harness.opened();
    const dialog = await openRowDialog(
      harness,
      screen.getByRole('button', { name: 'Edit disease' }),
    );

    await expectCreationFree(
      harness.user,
      attributeField('Node attribute', dialog),
      'The narrative pedigree’s affected-status attribute',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The one converted site with no creation test of its own                     */
/* -------------------------------------------------------------------------- */

/**
 * Both of a categorical bin's attribute slots, which `BinAttributeField`
 * serves and the categorical bin's own suite never creates through.
 *
 * The ordinal bin's suite drives the same component, so the SEAM is covered;
 * these two slots are not, and they are the two shapes of create in one
 * section — the bins themselves are a list of values, so they escalate to the
 * codebook's editor, and the follow-up answer is a box someone types into, so
 * it is one write and a new pill.
 */
describe('a categorical bin invents its attributes from the picker', () => {
  const openPrompt = async (harness: ReturnType<typeof renderStageEditor>) => {
    await harness.opened();
    return openRowDialog(
      harness,
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
  };

  it('escalates the bins attribute to the codebook’s editor, on the typed name', async () => {
    const harness = renderStageEditor({
      stageId: 'categorical-bin-1',
      registry: categoricalBinStageEditor,
    });
    const dialog = await openPrompt(harness);

    await inventAttribute(
      harness.user,
      attributeField('Attribute', dialog),
      'contactBand',
    );

    expect(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
    ).toHaveValue('contactBand');
  });

  it('writes the follow-up attribute straight to the codebook', async () => {
    const harness = renderStageEditor({
      stageId: 'categorical-bin-1',
      registry: categoricalBinStageEditor,
    });
    const dialog = await openPrompt(harness);
    await harness.user.click(
      within(dialog).getByRole('switch', { name: 'Follow-up other option' }),
    );
    const group = await within(dialog).findByRole('region', {
      name: 'Follow-up other option',
    });

    await inventAttribute(
      harness.user,
      attributeField('Other attribute', group),
      'somethingElse',
    );

    await waitFor(() => {
      expect(
        Object.values(
          harness.hostCodebook().node?.person?.variables ?? {},
        ).some(
          (variable) =>
            variable.name === 'somethingElse' && variable.type === 'text',
        ),
        'the codebook did not gain the text attribute the follow-up answer was created for',
      ).toBe(true);
    });
    // The window shows the researcher's NAME for an attribute and the prompt
    // stores its id, so the pill is read back: what a researcher sees is that
    // the slot now holds the attribute they just named.
    expect(
      within(attributeField('Other attribute', group)).getByText(
        'somethingElse',
      ),
    ).toBeInTheDocument();
  });
});
