import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';

import type { OptionGetter } from '../form/arrayFields/MultiSelect.tsx';

const messages = defineMessages({
  originalOrder: {
    id: 'protocolBuilder.sortOrder.originalOrder',
    defaultMessage: '*',
    description:
      'The choice a sort rule offers for "leave these in the order they already have" — the order network members were placed in, or the order a data file lists them in. Written as an asterisk because that is the value the protocol stores and the shorthand researchers already read in Architect; a language that has a better one-character shorthand may use it.',
  },
  descending: {
    id: 'protocolBuilder.sortOrder.descending',
    defaultMessage: 'Descending',
    description:
      'Direction offered for one sort rule: highest or latest first.',
  },
  ascending: {
    id: 'protocolBuilder.sortOrder.ascending',
    defaultMessage: 'Ascending',
    description:
      'Direction offered for one sort rule: lowest or earliest first.',
  },
  missingProperty: {
    id: 'protocolBuilder.sortOrder.missingProperty',
    defaultMessage: '{property} — this attribute is no longer in the codebook',
    description:
      'Label of the only choice left standing for a sort rule that names an attribute a collaborator has since deleted. property is the attribute’s stored record id, which the researcher never chose and which is all that is left of it. Rendered inside a plain dropdown option, which can carry no styling, so the explanation is part of the label.',
  },
  missingPropertyRefusal: {
    id: 'protocolBuilder.sortOrder.missingPropertyRefusal',
    defaultMessage:
      'This rule points at an attribute no longer in the codebook. Choose another or delete the rule.',
    description:
      'Shown above a prompt’s sort rules when one of them names an attribute that has been deleted from the codebook — the protocol’s definition of what an interview records. Names both ways out, because the rule looks complete and is not.',
  },
  unsortableProperty: {
    id: 'protocolBuilder.sortOrder.unsortableProperty',
    defaultMessage: '{property} — this attribute cannot be used to sort',
    description:
      'Label of the only choice left standing for a sort rule that names an attribute nothing can be put in order by — a node’s position on the canvas, say. property is the attribute’s name as the codebook gives it. Rendered inside a plain dropdown option, which can carry no styling, so the explanation is part of the label.',
  },
  unsortablePropertyRefusal: {
    id: 'protocolBuilder.sortOrder.unsortablePropertyRefusal',
    defaultMessage:
      'This rule points at an attribute that cannot be used to sort. Choose another or delete the rule.',
    description:
      'Shown above a prompt’s sort rules when one of them names an attribute that is still in the codebook but holds nothing one network member can be put ahead of another by. Names both ways out, because the rule looks complete and is not.',
  },
});

/**
 * One property or attribute a sort rule may order by — what a caller passes
 * to `getSortOrderOptionGetter`, whether it comes from this subject's codebook
 * attributes (via `variablesForSubject`, converted to options) or from
 * external-data column headers a roster stage reads instead.
 *
 * `type` is optional because external-data columns carry none; when it is
 * present and is `'layout'` (a codebook attribute holding a node's on-canvas
 * position, not a value a sort can compare) the option is excluded.
 *
 * `disabled` marks a property that has to be SHOWN without being selectable —
 * a value a rule still names that it cannot be pointed at, whether because the
 * attribute has been deleted or because nothing can be ordered by it (see
 * `unusableSortProperties`). It is a property of the property, not of the
 * rules using it: the getter disables an option a rule already names, but that
 * disabling ends the moment the rule points somewhere else, and one of these
 * must never become choosable again.
 */
export type SortableProperty = Readonly<{
  value: string;
  label: string;
  type?: string;
  disabled?: boolean;
}>;

const NON_SORTABLE_TYPES = ['layout'];

/**
 * Whether one node can be put ahead of another by this property at all.
 *
 * The one place the question is answered, because two readers ask it and they
 * have to agree: the option getter, which decides what a rule may be pointed
 * at, and `unusableSortProperties`, which decides what a rule already pointing
 * somewhere is refused for. While they disagreed, an attribute the getter
 * filtered out counted as a property in good standing — so a rule naming it
 * was offered nothing to render, went blank, raised no refusal, and saved the
 * hidden rule straight back.
 *
 * A property carrying no `type` at all is sortable: external-data columns come
 * with none, and a roster orders its participants by them.
 */
const isSortable = ({ type }: SortableProperty): boolean =>
  !NON_SORTABLE_TYPES.includes(type ?? '');

/**
 * The fixed "preserve the source order" choice every sort rule offers
 * alongside the subject's own properties — the order nodes were placed in a
 * bin/bucket, or the order they appear in the roster's data file.
 */
const ORIGINAL_ORDER_VALUE = '*';

const originalOrderOption = (intl: IntlShape): SortableProperty => ({
  value: ORIGINAL_ORDER_VALUE,
  label: intl.formatMessage(messages.originalOrder),
});

const directionOptions = (intl: IntlShape): SortableProperty[] => [
  { value: 'desc', label: intl.formatMessage(messages.descending) },
  { value: 'asc', label: intl.formatMessage(messages.ascending) },
];

// `allValues` is the array field's own value, so it is undefined until the
// field holds rows, and a partially-filled row has no `property` yet.
const hasSortProperty = (row: unknown): row is { property: string } =>
  typeof row === 'object' &&
  row !== null &&
  'property' in row &&
  typeof row.property === 'string';

/**
 * What reaches the rendered option: `value`, `label`, and — only when the
 * property carries it — `disabled`.
 *
 * A caller's `type` never does; it is how this module decides what to offer,
 * not something the control shows. `disabled` is omitted rather than written
 * as `false` so an ordinary property renders the same object it always did.
 * There is no `hint` alongside it: these render as native `<option>`s, which
 * carry text and nothing else, so a property that cannot be chosen has to say
 * why in its own label (`missingSortPropertyLabel`).
 */
const toOption = ({
  value,
  label,
  disabled,
}: SortableProperty): SortableProperty =>
  disabled === true ? { value, label, disabled: true } : { value, label };

/**
 * How a sort rule names an attribute that is no longer in the codebook, worded
 * the way the attribute pickers word it.
 *
 * Takes the reader's own formatter rather than reaching for one: this is a
 * label the caller renders, and a module-level English formatter here would
 * make the one option a dangling rule can still show the one option nobody can
 * read in their own language.
 */
export const missingSortPropertyLabel = (
  property: string,
  intl: IntlShape,
): string => intl.formatMessage(messages.missingProperty, { property });

/**
 * The same, for an attribute that is still in the codebook and still cannot
 * order anything.
 *
 * Named by the codebook's own word for it rather than by its record id: unlike
 * a deleted attribute, this one is still there to be named, and telling a
 * researcher that `d4e1…` cannot sort would leave them hunting for it.
 */
export const unsortableSortPropertyLabel = (
  property: string,
  intl: IntlShape,
): string => intl.formatMessage(messages.unsortableProperty, { property });

/**
 * What a researcher is told about a rule left pointing at a deleted attribute.
 *
 * The rule is not half-filled — it holds an id, and the id is exactly the
 * problem — so the generic "every row needs a value in each column" would be
 * both wrong and unhelpful. This one names the situation and both ways out.
 *
 * Encoded rather than formatted: it travels on `DanglingCells.message`, which
 * a `messageRuleValidation` rule hands to the form as a plain string, and
 * `FormErrors` decodes it where it is read.
 */
export const MISSING_SORT_PROPERTY_MESSAGE = createMessageError(
  messages.missingPropertyRefusal,
);

/**
 * And what they are told about a rule pointing at one that cannot sort.
 *
 * Its own sentence rather than the one above: the attribute has not gone
 * anywhere, and being sent to look for something that is still there is worse
 * than being told nothing.
 */
export const UNSORTABLE_SORT_PROPERTY_MESSAGE = createMessageError(
  messages.unsortablePropertyRefusal,
);

const ruleProperty = (rule: unknown): string | undefined => {
  if (typeof rule !== 'object' || rule === null) return undefined;
  const property = Reflect.get(rule, 'property');
  return typeof property === 'string' && property !== '' ? property : undefined;
};

/**
 * A property a rule names that it cannot be pointed at, with the option that
 * shows the researcher what it is and the sentence a row holding it is refused
 * with.
 *
 * The two travel together because they are the two halves of one answer: the
 * option says what the cell is showing, and the message says why it cannot
 * stay. Split apart, a caller could offer the option and refuse with the other
 * reason's words.
 */
export type UnusableSortProperty = Readonly<{
  option: SortableProperty;
  message: string;
}>;

/**
 * Sort keys these rules name that they cannot be pointed at — because the
 * property list no longer describes them, or because it describes them as
 * something nothing can be ordered by.
 *
 * `SortRuleSchema.property` is `existence: 'unchecked'`, so a rule whose
 * attribute a collaborator deleted still validates and still saves — which is
 * right, because deleting an attribute must not make somebody else's stage
 * unopenable. But a cell renders from the option list, so a value no OFFERED
 * option carries leaves the control BLANK while the value behind it is
 * untouched: the researcher sees an empty required cell, cannot find out what
 * it points at, and saves the dangling reference straight back.
 *
 * So the value is offered back as its own option, labelled for what it is and
 * permanently `disabled` — readable as the current choice, never choosable
 * afresh, and never choosable again once the rule has been pointed elsewhere.
 *
 * Judged against what the option getter actually OFFERS rather than against
 * everything the caller passed, because those are two different sets: an
 * attribute of a non-sortable type is filtered out of the offer, and counting
 * it as known left exactly the blank control this exists to prevent, with no
 * refusal behind it. Which of the two it is decides the words, and only the
 * words: an attribute that is still there must not be described as missing.
 *
 * `undefined` is "the caller does not know yet" and reports nothing. That is
 * the state every caller passes through: a prompt whose stage has not been
 * told what it collects has no codebook to be missing from, and judging its
 * rules there would report every one of them as dangling.
 *
 * An EMPTY list is not that state. A subject with nothing to sort by is a real
 * answer — a node type whose every attribute has been deleted, an external
 * data file with one column — and reading it as "not known yet" took the
 * option, the refusal and the label away all at once, exactly where a rule is
 * most certainly dangling: the control went blank and the researcher saved the
 * dangling rule straight back. So a caller that does not know says so with
 * `undefined`, and nothing else means it.
 */
export const unusableSortProperties = (
  rules: unknown,
  sortableProperties: readonly SortableProperty[] | undefined,
  intl: IntlShape,
): UnusableSortProperty[] => {
  if (!Array.isArray(rules) || sortableProperties === undefined) return [];
  const offered = new Set(
    sortableProperties.filter(isSortable).map(({ value }) => value),
  );
  const filteredOut = new Map(
    sortableProperties
      .filter((property) => !isSortable(property))
      .map((property) => [property.value, property]),
  );
  const unusable = new Map<string, UnusableSortProperty>();
  for (const rule of rules) {
    const property = ruleProperty(rule);
    if (
      property === undefined ||
      property === ORIGINAL_ORDER_VALUE ||
      offered.has(property)
    ) {
      continue;
    }
    const unsortable = filteredOut.get(property);
    unusable.set(property, {
      option: {
        value: property,
        label:
          unsortable === undefined
            ? missingSortPropertyLabel(property, intl)
            : unsortableSortPropertyLabel(unsortable.label, intl),
        disabled: true,
      },
      message:
        unsortable === undefined
          ? MISSING_SORT_PROPERTY_MESSAGE
          : UNSORTABLE_SORT_PROPERTY_MESSAGE,
    });
  }
  return [...unusable.values()];
};

/**
 * Builds the `OptionGetter` a sort-rule `MultiSelect` needs for its
 * `property` and `direction` columns — the bin/bucket sort order editors and
 * a roster stage's external-data sort options all build on this one helper.
 *
 * Ported from Architect's two near-duplicate implementations
 * (`getSortOrderOptionGetter` for bin/bucket prompts, and
 * `SortOptionsForExternalData/getSortOrderOptionGetter` for roster sort),
 * which had drifted apart; this keeps the more hardened of the two —
 * filtering by `type` rather than `value`, and tolerating an `allValues` that
 * is not yet an array of rows.
 */
export const getSortOrderOptionGetter =
  (
    sortableProperties: readonly SortableProperty[],
    intl: IntlShape,
  ): OptionGetter =>
  (fieldName, _rowValues, allValues) => {
    switch (fieldName) {
      case 'property': {
        const used = Array.isArray(allValues)
          ? allValues.filter(hasSortProperty).map((row) => row.property)
          : [];

        return [originalOrderOption(intl), ...sortableProperties]
          .filter(isSortable)
          .map((option) =>
            used.includes(option.value)
              ? { ...toOption(option), disabled: true }
              : toOption(option),
          );
      }
      case 'direction':
        return directionOptions(intl);
      default:
        return [];
    }
  };
