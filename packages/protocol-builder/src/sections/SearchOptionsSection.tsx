import { type ComponentType, useMemo } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import LikertScaleField from '@codaco/fresco-ui/form/fields/LikertScale';
import {
  type MessageRule,
  messageRuleValidation,
} from '@codaco/fresco-ui/form/validation/helpers';

import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';
import {
  DATA_SOURCE,
  useOrphanedColumnChoices,
  useRosterColumns,
} from './useRosterColumns.ts';

/** Where a roster stage records how a participant's search is matched. */
const MATCH_PROPERTIES = 'searchOptions.matchProperties';
const FUZZINESS = 'searchOptions.fuzziness';

const SEARCH_CAPABILITY: SectionCapability = {
  fields: [MATCH_PROPERTIES, FUZZINESS],
  confirmClear: {
    title: 'This will turn off roster search',
    description:
      'This will remove the attributes a participant’s search is matched against, and the tolerance you set. Do you want to continue?',
    confirmLabel: 'Turn off search',
  },
};

/**
 * A tolerance rather than a number: the value is a distance the matcher
 * allows, and a researcher choosing "Exact" is not choosing 0, they are saying
 * what they want the search to do.
 */
const TOLERANCE_OPTIONS = [
  { value: 0, label: 'Exact' },
  { value: 0.25, label: 'Close matches only' },
  { value: 0.5, label: 'Allow small differences' },
  { value: 0.75, label: 'Allow typos and misspellings' },
];

const CheckboxGroup = CheckboxGroupField as ComponentType<
  Record<string, unknown>
>;
const LikertScale = LikertScaleField as ComponentType<Record<string, unknown>>;

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
 */
const matchIsAnswered: MessageRule = (value) =>
  Array.isArray(value) && value.length > 0
    ? undefined
    : 'Choose at least one attribute for a search to match against.';

const toleranceValidation = messageRuleValidation([
  // `0` is an answer — the strictest setting — so the test is on the TYPE, not
  // on truthiness.
  (value) =>
    typeof value === 'number'
      ? undefined
      : 'Choose how closely a search must match.',
]);

export type SearchOptionsCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /** Said instead of `description` while the section is waiting on a roster. */
  waitingDescription: string;
  matchLabel: string;
  matchHint: string;
  toleranceLabel: string;
  toleranceHint: string;
}>;

const DEFAULT_COPY: SearchOptionsCopy = {
  sectionTitle: 'Roster search',
  description:
    'Let the participant find someone by typing, and choose what their typing is matched against.',
  waitingDescription: 'Choose a roster data file before setting up its search.',
  matchLabel: 'Attributes a search matches',
  matchHint:
    'What the participant types is compared against these. Choose the ones they would actually search for.',
  toleranceLabel: 'How closely a search must match',
  toleranceHint:
    'A stricter setting narrows a roster of similar people; a looser one forgives typos.',
};

export type SearchOptionsSectionProps = Readonly<{
  copy?: Partial<SearchOptionsCopy>;
}>;

/**
 * How a participant finds someone in a long roster.
 *
 * Optional, because a roster of a dozen people is read rather than searched —
 * which is what switching the capability off says, clearing both paths and
 * unmounting both controls. Once it is on, both halves are required, and each
 * says so on its own control rather than waiting for the schema to refuse a
 * path.
 */
export default function SearchOptionsSection({
  copy,
}: SearchOptionsSectionProps = {}) {
  const words = { ...DEFAULT_COPY, ...copy };
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
      ...orphans.options,
    ],
    [columns.names, orphans.options],
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
      title={words.sectionTitle}
      description={
        columns.waiting ? words.waitingDescription : words.description
      }
      disabled={columns.waiting}
      // Everything below names a column of the data file, so a different file
      // makes every one of these a reference to something that may not be
      // there. The PATH of the file, so the choice that caused the clear
      // travels in the same batch as the clear itself — a file this session
      // staged is withheld from a live host, and its clears have to wait with
      // it or the host is left describing the old file with none of the
      // settings that described it.
      resetOn={DATA_SOURCE}
      capability={SEARCH_CAPABILITY}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          Every attribute you choose is searched on each keystroke, so a long
          roster searches faster with fewer of them.
        </AlertDescription>
      </Alert>
      <ProtocolField<typeof CheckboxGroup>
        name={MATCH_PROPERTIES}
        component={CheckboxGroup}
        label={words.matchLabel}
        hint={words.matchHint}
        options={options}
        custom={matchValidation}
      />
      <ProtocolField<typeof LikertScale>
        name={FUZZINESS}
        component={LikertScale}
        label={words.toleranceLabel}
        hint={words.toleranceHint}
        options={TOLERANCE_OPTIONS}
        custom={toleranceValidation}
      />
    </BuilderSection>
  );
}
