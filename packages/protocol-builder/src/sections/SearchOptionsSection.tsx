import { type ComponentType, useMemo } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import LikertScaleField from '@codaco/fresco-ui/form/fields/LikertScale';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';
import { useRosterColumns } from './useRosterColumns.ts';

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

const readSearchOptions = (values: Record<string, FieldValue>) => {
  const searchOptions = values.searchOptions;
  const options =
    typeof searchOptions === 'object' && searchOptions !== null
      ? searchOptions
      : {};
  const matchProperties = Reflect.get(options, 'matchProperties');
  return {
    matched: Array.isArray(matchProperties) ? matchProperties.length : 0,
    tolerance: Reflect.get(options, 'fuzziness'),
  };
};

/**
 * Both halves, or neither.
 *
 * Search is optional and switching it off clears both paths, so an empty pair
 * passes — that is what "this roster is not searched" looks like. What cannot
 * stand is half of it: a search with nothing to match against finds nobody
 * whatever the participant types, and a set of attributes with no tolerance is
 * refused by the schema as `searchOptions.fuzziness` against a path.
 *
 * Each rule reads the OTHER value out of the form values it is handed rather
 * than out of a closure: a field's validation is memoised for the field's
 * lifetime, so a closed-over sibling would be pinned to its first render.
 */
const matchValidation = messageRuleValidation([
  (value, values) => {
    const matched = Array.isArray(value) ? value.length : 0;
    if (matched > 0) return undefined;
    return typeof readSearchOptions(values).tolerance === 'number'
      ? 'Choose at least one attribute for a search to match against.'
      : undefined;
  },
]);

const toleranceValidation = messageRuleValidation([
  // `0` is an answer — the strictest setting — so the test is on the TYPE, not
  // on truthiness.
  (value, values) =>
    typeof value === 'number' || readSearchOptions(values).matched === 0
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
 * Optional, because a roster of a dozen people is read rather than searched.
 * Once it is on, both halves are required: a search with nothing to match
 * against finds nobody, and the schema refuses it — as
 * `searchOptions.matchProperties` against a path, long after the researcher
 * has moved on.
 */
export default function SearchOptionsSection({
  copy,
}: SearchOptionsSectionProps = {}) {
  const words = { ...DEFAULT_COPY, ...copy };
  const columns = useRosterColumns();

  const options = useMemo(
    () => columns.names.map((name) => ({ value: name, label: name })),
    [columns.names],
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
      // there.
      resetOn={columns.resourceId}
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
