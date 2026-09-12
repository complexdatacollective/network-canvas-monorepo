import { useMemo } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import LikertScaleField from '@codaco/fresco-ui/form/fields/LikertScale';
import {
  type MessageRule,
  messageRuleValidation,
} from '@codaco/fresco-ui/form/validation/helpers';

import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection, {
  type SectionCapability,
} from '../../../sections/BuilderSection.tsx';
import {
  DATA_SOURCE,
  useColumnSectionShell,
  useOrphanedColumnChoices,
  useRosterColumns,
} from './rosterColumns.ts';

/** Where a roster stage records how a participant's search is matched. */
const MATCH_PROPERTIES = 'searchOptions.matchProperties';
const FUZZINESS = 'searchOptions.fuzziness';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.searchOptions.title',
    defaultMessage: 'Roster search',
    description:
      'Heading of the section letting a participant find someone in a roster by typing. A roster is a list of people imported from a data file.',
  },
  description: {
    id: 'protocolBuilder.searchOptions.description',
    defaultMessage:
      'Configure how participants find and select nodes from the roster.',
    description: 'Description of the roster-search section.',
  },
  waitingDescription: {
    id: 'protocolBuilder.searchOptions.waitingDescription',
    defaultMessage: 'Select a roster data source before configuring search.',
    description:
      'Shown in place of the roster-search section’s description while no data file has been chosen, so there are no columns for a search to match against.',
  },
  matchLabel: {
    id: 'protocolBuilder.searchOptions.matchLabel',
    defaultMessage: 'Searchable attributes',
    description:
      'Label of the checkboxes choosing which attributes of the data file a participant’s typing is compared against.',
  },
  matchHint: {
    id: 'protocolBuilder.searchOptions.matchHint',
    defaultMessage:
      "You can configure which attributes are considered when matching roster nodes to the user's query.",
    description:
      'Guidance under the checkboxes choosing what a participant’s search is matched against.',
  },
  toleranceLabel: {
    id: 'protocolBuilder.searchOptions.toleranceLabel',
    defaultMessage: 'Search accuracy',
    description:
      'Label of the scale choosing how much difference between what a participant types and what the data file holds still counts as a match.',
  },
  toleranceHint: {
    id: 'protocolBuilder.searchOptions.toleranceHint',
    defaultMessage:
      'Search accuracy determines how closely the text the participant types must be to an attribute for it to be considered a match.',
    description:
      'Guidance under the scale choosing how closely a participant’s search must match.',
  },
  keystrokeNotice: {
    id: 'protocolBuilder.searchOptions.keystrokeNotice',
    defaultMessage:
      'Every attribute you choose is searched on each keystroke, so a long roster searches faster with fewer of them.',
    description:
      'Notice above the checkboxes, saying why choosing fewer attributes makes a long roster feel faster to the participant.',
  },
  toleranceExact: {
    id: 'protocolBuilder.searchOptions.toleranceExact',
    defaultMessage: 'Exact',
    description:
      'The strictest of four search tolerances: only what the participant typed, exactly, is a match.',
  },
  toleranceClose: {
    id: 'protocolBuilder.searchOptions.toleranceClose',
    defaultMessage: 'Close matches only',
    description:
      'The second of four search tolerances, between "Exact" and "Allow small differences".',
  },
  toleranceSmallDifferences: {
    id: 'protocolBuilder.searchOptions.toleranceSmallDifferences',
    defaultMessage: 'Allow small differences',
    description:
      'The third of four search tolerances, between "Close matches only" and "Allow typos and misspellings".',
  },
  toleranceTypos: {
    id: 'protocolBuilder.searchOptions.toleranceTypos',
    defaultMessage: 'Allow typos and misspellings',
    description:
      'The loosest of four search tolerances: a word the participant spelled wrongly still finds the person.',
  },
  toleranceSaved: {
    id: 'protocolBuilder.searchOptions.toleranceSaved',
    defaultMessage: 'Saved setting ({value, number})',
    description:
      'Label of the extra position the tolerance scale offers when the stage was saved with a tolerance that is not one of the four named ones — an older protocol, or one authored elsewhere. value is the number the stage holds, which is what the researcher has to be able to see and keep. Kept short: it is read as one tick label beside the four named ones.',
  },
  matchRequired: {
    id: 'protocolBuilder.searchOptions.matchRequired',
    defaultMessage:
      'Choose at least one attribute for a search to match against.',
    description:
      'Refusal shown against the checkboxes when roster search is switched on and nothing is checked, which would find nobody whatever the participant types.',
  },
  toleranceRequired: {
    id: 'protocolBuilder.searchOptions.toleranceRequired',
    defaultMessage: 'Choose how closely a search must match.',
    description:
      'Refusal shown against the tolerance scale when roster search is switched on and no tolerance has been chosen.',
  },
  clearTitle: {
    id: 'protocolBuilder.searchOptions.clearTitle',
    defaultMessage: 'This will turn off roster search',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that lets a participant search a roster.',
  },
  clearDescription: {
    id: 'protocolBuilder.searchOptions.clearDescription',
    defaultMessage:
      'This will remove the attributes a participant’s search is matched against, and the tolerance you set. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching roster search off discards the searchable attributes and the fuzziness setting. A roster is a list of people imported from a data file.',
  },
  clearConfirm: {
    id: 'protocolBuilder.searchOptions.clearConfirm',
    defaultMessage: 'Turn off search',
    description:
      'Action that confirms switching roster search off and discarding how it was configured.',
  },
});

const SEARCH_CAPABILITY: SectionCapability = {
  fields: [MATCH_PROPERTIES, FUZZINESS],
  confirmClear: {
    title: messages.clearTitle,
    description: messages.clearDescription,
    confirmLabel: messages.clearConfirm,
  },
};

/**
 * A tolerance rather than a number: the value is a distance the matcher
 * allows, and a researcher choosing "Exact" is not choosing 0, they are saying
 * what they want the search to do.
 */
type Tolerance = Readonly<{ value: number; label: string }>;

const toleranceOptions = (intl: IntlShape): Tolerance[] => [
  { value: 0, label: intl.formatMessage(messages.toleranceExact) },
  { value: 0.25, label: intl.formatMessage(messages.toleranceClose) },
  {
    value: 0.5,
    label: intl.formatMessage(messages.toleranceSmallDifferences),
  },
  { value: 0.75, label: intl.formatMessage(messages.toleranceTypos) },
];

/**
 * The scale as it has to be for the value this stage actually holds.
 *
 * The four tolerances are the settings a researcher CHOOSES, but the schema
 * takes any number and a protocol authored elsewhere — or by an older editor —
 * can hold one that is not among them. The scale renders from its option list,
 * so such a value is no position at all: the control reads as unanswered, the
 * thumb parks on the middle option, and the first interaction anywhere near it
 * records that middle option over a setting nobody asked to change.
 *
 * So the held value is offered back as a position of its own, in its numeric
 * place, exactly as a roster list offers back a column its data file no longer
 * carries: the control shows what the stage holds, and nothing is lost to a
 * stray click. It is not a choice — it disappears the moment the researcher
 * moves to a named setting, which is what stops it becoming a fifth tolerance
 * that anyone could pick.
 */
const withSavedTolerance = (
  offered: Tolerance[],
  held: unknown,
  intl: IntlShape,
): Tolerance[] => {
  if (typeof held !== 'number' || !Number.isFinite(held)) return offered;
  if (offered.some((option) => option.value === held)) return offered;
  return [
    ...offered,
    {
      value: held,
      label: intl.formatMessage(messages.toleranceSaved, { value: held }),
    },
  ].toSorted((one, other) => one.value - other.value);
};

/**
 * Both halves are required, and neither excuses the other.
 *
 * Search is optional, and "this roster is not searched" is said by switching
 * the capability off — which clears both paths and unmounts both controls, so
 * neither rule runs at all. Once the capability is ON, every half of it has to
 * be answered: a search with nothing to match against finds nobody whatever
 * the participant types, and either half missing is refused by the schema as
 * `searchOptions.matchProperties` or `searchOptions.fuzziness` against a path,
 * long after the researcher has moved on.
 *
 * Each rule therefore judges only its OWN value. Reading the sibling to excuse
 * an empty half is what let the commonest case through: switching search on
 * and saving straight away leaves both empty, and two rules that excuse each
 * other say nothing about a pair that is entirely missing.
 *
 * Both refusals are encoded rather than formatted: a `MessageRule` hands the
 * form a plain string, and `FieldErrors` decodes it in the reader's own
 * language where it is shown.
 */
const matchIsAnswered: MessageRule = (value) =>
  Array.isArray(value) && value.length > 0
    ? undefined
    : createMessageError(messages.matchRequired);

const toleranceValidation = messageRuleValidation([
  // `0` is an answer — the strictest setting — so the test is on the TYPE, not
  // on truthiness.
  (value) =>
    typeof value === 'number'
      ? undefined
      : createMessageError(messages.toleranceRequired),
]);

/**
 * How a participant finds someone in a long roster.
 *
 * Optional, because a roster of a dozen people is read rather than searched —
 * which is what switching the capability off says, clearing both paths and
 * unmounting both controls. Once it is on, both halves are required, and each
 * says so on its own control rather than waiting for the schema to refuse a
 * path.
 */
export default function SearchOptionsSection() {
  const intl = useAppIntl();
  const columns = useRosterColumns();

  // A checked column the file does not carry, so the researcher can see what
  // their search is actually matching against. The list holds column names
  // rather than rows, which is the only thing that differs from the card and
  // sort lists — the judgement, the label and the refusal are the same ones.
  const orphans = useOrphanedColumnChoices(MATCH_PROPERTIES, columns.names);

  // Columns nobody has read yet and a file that carries none are both nothing
  // to offer, so this section reads them the same way. Orphans are appended
  // rather than mixed in: they are not columns of this file, they are names the
  // stage still holds, and each is offered only while it is still checked.
  const options = useMemo(
    () => [
      ...(columns.names ?? []).map((name) => ({ value: name, label: name })),
      ...orphans.options.map(({ value, label }) => ({ value, label })),
    ],
    [columns.names, orphans.options],
  );

  const shell = useColumnSectionShell(
    columns,
    messages.description,
    messages.waitingDescription,
  );

  // Read live rather than from the committed draft: the extra position has to
  // go the moment the researcher moves to a named setting, or the value they
  // just left would stay choosable.
  const heldTolerance = useStageValue(FUZZINESS);
  const tolerances = useMemo(
    () => withSavedTolerance(toleranceOptions(intl), heldTolerance, intl),
    [heldTolerance, intl],
  );

  /**
   * Built here rather than as a module constant, because one of its rules has
   * to read what the data file turned out to hold. It keeps ONE identity all
   * the same: `orphans.refusal` reads the current orphans through a ref, so a
   * rule registered before the gateway answered is still the rule that runs.
   * See `useOrphanedColumnChoices`.
   *
   * Unanswered first, dangling second — the order `messageRuleValidation`
   * documents, and the one that tells a researcher what is missing before it
   * tells them what they kept is stale.
   */
  const matchValidation = useMemo(
    () => messageRuleValidation([matchIsAnswered, orphans.refusal]),
    [orphans.refusal],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={shell.description}
      disabled={shell.disabled}
      // Everything below names a column of the data file, so a different file
      // makes every one of these a reference to something that may not be
      // there. See `CardDisplaySection`, which resets on the same path for the
      // same reason.
      resetOn={DATA_SOURCE}
      capability={SEARCH_CAPABILITY}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          {intl.formatMessage(messages.keystrokeNotice)}
        </AlertDescription>
      </Alert>
      <Field<typeof CheckboxGroupField>
        name={MATCH_PROPERTIES}
        component={CheckboxGroupField}
        label={intl.formatMessage(messages.matchLabel)}
        hint={intl.formatMessage(messages.matchHint)}
        options={options}
        custom={matchValidation}
      />
      <Field<typeof LikertScaleField>
        name={FUZZINESS}
        component={LikertScaleField}
        label={intl.formatMessage(messages.toleranceLabel)}
        hint={intl.formatMessage(messages.toleranceHint)}
        options={tolerances}
        custom={toleranceValidation}
      />
    </BuilderSection>
  );
}
