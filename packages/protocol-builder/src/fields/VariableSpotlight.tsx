import { Info, Plus, Search, TriangleAlert } from 'lucide-react';
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { ListLayout } from '@codaco/fresco-ui/collection/layout/ListLayout';
import type { ItemProps, Key } from '@codaco/fresco-ui/collection/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  normalizeForComparison,
  VariableNameSchema,
} from '@codaco/shared-consts';

import { protocolAuthoringLinks } from '../interfaces/documentation.ts';
import AttributePill from './AttributePill.tsx';
import type { VariablePickerOption } from './VariablePickerField.tsx';

const messages = defineMessages({
  dialogName: {
    id: 'protocolBuilder.variablePicker.dialogName',
    defaultMessage: 'Select an attribute',
    description:
      'Accessible name of the window a researcher searches the protocol’s codebook in, used only where the control that opened it carries no label of its own to be named after. An attribute is one thing an interview records about a network member.',
  },
  searchLabel: {
    id: 'protocolBuilder.variablePicker.searchLabel',
    defaultMessage: 'Find or create an attribute',
    description:
      'Accessible name of the search box at the top of the attribute window. Typing in it narrows the list below, and — where this control allows it — offers to create an attribute under whatever was typed.',
  },
  searchPlaceholder: {
    id: 'protocolBuilder.variablePicker.searchPlaceholder',
    defaultMessage: 'Find or create an attribute…',
    description:
      'Placeholder in the attribute window’s search box where this control allows a new attribute to be created.',
  },
  searchOnlyPlaceholder: {
    id: 'protocolBuilder.variablePicker.searchOnlyPlaceholder',
    defaultMessage: 'Find an attribute…',
    description:
      'Placeholder in the attribute window’s search box where this control only chooses from attributes that already exist.',
  },
  resultsLabel: {
    id: 'protocolBuilder.variablePicker.resultsLabel',
    defaultMessage: 'Attribute results',
    description:
      'Accessible name of the list of attributes under the attribute window’s search box.',
  },
  rowTypeDescription: {
    id: 'protocolBuilder.variablePicker.rowTypeDescription',
    defaultMessage: 'Attribute type: {attributeType}',
    description:
      'Read out after an attribute’s name in the list, saying what kind of answer it records. attributeType is a protocol schema token such as "number", "text" or "categorical", and is shown as it is stored rather than translated. Read as a label and its value, not as a sentence.',
  },
  createRow: {
    id: 'protocolBuilder.variablePicker.createRow',
    defaultMessage: 'Create new attribute called “{attributeName}”.',
    description:
      'First row of the attribute list, offering to add an attribute under the name the researcher has typed into the search box. attributeName is what they typed and is not translated.',
  },
  createRowRefused: {
    id: 'protocolBuilder.variablePicker.createRowRefused',
    defaultMessage: 'Cannot create attribute named “{attributeName}”: {reason}',
    description:
      'The same first row of the attribute list, switched off because the name typed cannot be used. attributeName is what the researcher typed and is not translated; reason is the sentence saying what is wrong with it.',
  },
  createRowBusy: {
    id: 'protocolBuilder.variablePicker.createRowBusy',
    defaultMessage: 'Creating the attribute “{attributeName}”…',
    description:
      'The first row of the attribute list while the attribute the researcher asked for is being added to the codebook — the protocol’s definition of what an interview records. attributeName is the name they typed and is not translated.',
  },
  firstAttribute: {
    id: 'protocolBuilder.variablePicker.firstAttribute',
    defaultMessage:
      'Nothing has been recorded about this type yet. Type a name above to create the first attribute, and see the <docs>documentation on attribute naming</docs> for what makes a good one.',
    description:
      'Shown in the attribute window when the protocol’s codebook holds nothing this control can offer and the researcher may create one. The text inside the docs tag is the words of a link to the Network Canvas documentation and must read as part of the sentence.',
  },
  nothingToSelect: {
    id: 'protocolBuilder.variablePicker.nothingToSelect',
    defaultMessage:
      'There are no attributes to choose from here, and one cannot be created from this window. Create one elsewhere in your protocol and come back to choose it.',
    description:
      'Shown in the attribute window when the protocol’s codebook holds nothing this control can offer and this control does not allow one to be created.',
  },
  nothingMatches: {
    id: 'protocolBuilder.variablePicker.nothingMatches',
    defaultMessage:
      'No attribute matches what you typed, and one cannot be created from this window. Create one elsewhere in your protocol and come back to choose it.',
    description:
      'Shown in the attribute window when what the researcher typed in the search box matches none of the attributes offered and this control does not allow one to be created.',
  },
  nameTaken: {
    id: 'protocolBuilder.variablePicker.nameTaken',
    defaultMessage: 'this type already has an attribute called that',
    description:
      'Reason given on the switched-off create row of the attribute list. Reads after a colon, so it is a clause rather than a sentence: “Cannot create attribute named “age”: this type already has an attribute called that”.',
  },
  nameInvalid: {
    id: 'protocolBuilder.variablePicker.nameInvalid',
    defaultMessage:
      'only letters, numbers and the symbols ._-: can be used in a name',
    description:
      'Reason given on the switched-off create row of the attribute list when the name typed holds characters the export formats cannot carry. Reads after a colon, so it is a clause rather than a sentence. The listed symbols are literal characters and must not be translated.',
  },
});

const RESULTS_ID_SUFFIX = 'spotlight-results';

const ROW_CLASSES = cx(
  'focusable hover:bg-surface-2 flex w-full min-w-0 items-center rounded px-4 py-2',
  'data-focused:bg-surface-2',
  'data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:hover:bg-transparent',
);

/**
 * What an attribute's row is keyed under.
 *
 * An id the protocol minted and the two keys this list makes up for itself
 * share one key space, and a protocol may file an attribute under an id
 * holding a colon — so an attribute stored as `create:nick` would be the same
 * key as the offer to create `nick`, and the collection keeps only the first
 * of two rows that share one. Prefixed, no id can name a row this list
 * invented.
 */
const ATTRIBUTE_KEY_PREFIX = 'attribute:';

/**
 * One row of the list, which is one of three things.
 *
 * A discriminated union rather than an option with flags, because the three
 * answer the Enter key differently: an attribute is chosen, a create is asked
 * for, and a refused create is not selectable at all.
 */
type SpotlightRow =
  | Readonly<{ id: string; kind: 'attribute'; option: VariablePickerOption }>
  | Readonly<{ id: string; kind: 'create'; name: string }>
  | Readonly<{ id: string; kind: 'refused'; name: string; reason: string }>;

/**
 * What the window does once a create has answered.
 *
 * Two answers rather than the create's own three, because only one question is
 * asked here: whether the name the researcher typed is still theirs to
 * correct. Everything else about the outcome — what was selected, what has to
 * be said about where the attribute went — belongs to the field, which is what
 * is on screen once this closes.
 */
export type CreateRowOutcome =
  /** Nothing was written. The window stays open with the name in the box. */
  | 'correct-the-name'
  /** The same, with the reason to show beside the name that was refused. */
  | Readonly<{ keep: string }>
  /** Nothing more to do here; whatever is left to say is said on the field. */
  | 'finished';

export type VariableSpotlightProps = Readonly<{
  'open': boolean;
  'onOpenChange': (open: boolean) => void;
  /**
   * What may be chosen, in the caller's own order. Sorted here by name, since
   * a researcher scanning for one they authored months ago scans
   * alphabetically and the caller's order is whatever its filters left.
   */
  'options': readonly VariablePickerOption[];
  'onSelect': (value: string) => void;
  /**
   * Adds an attribute under the typed name, or `undefined` where this caller
   * only chooses from what exists.
   *
   * Absence IS "creation is not allowed here": the package already says so by
   * leaving `onCreateOption` off the picker, and a second prop meaning the
   * same thing is a second thing that can disagree with it.
   */
  'onCreate'?: (name: string) => Promise<CreateRowOutcome>;
  /**
   * Every attribute name the type this would be created on already holds.
   *
   * Wider than `options`, which the caller has narrowed to the kinds of answer
   * it can use: a name is taken by a date attribute just as firmly as by a
   * text one, and offering to create it would ask the codebook for a name it
   * already holds.
   */
  'namesInUse'?: readonly string[];
  /** Names the dialog after the label of the field that opened it. */
  'aria-labelledby'?: string;
  'finalFocus'?: ComponentProps<typeof ModalPopup>['finalFocus'];
}>;

/**
 * Chooses one attribute out of a codebook, over a search box and a keyboard
 * navigable list, and offers to create the one that is missing.
 *
 * A window rather than a list beside the control because the codebooks this
 * searches are long: a type that has been through a few studies carries dozens
 * of attributes of one kind, and a control that showed them all in place would
 * bury whatever the researcher was reading underneath it. The window is the
 * shape Architect has asked this question in for years, and a researcher
 * moving between the two apps should not have to learn a second one.
 */
export default function VariableSpotlight({
  open,
  onOpenChange,
  options,
  onSelect,
  onCreate,
  namesInUse,
  'aria-labelledby': ariaLabelledBy,
  finalFocus,
}: VariableSpotlightProps) {
  const intl = useAppIntl();
  const scopeId = useId();
  const resultsId = `${scopeId}${RESULTS_ID_SUFFIX}`;
  const [term, setTerm] = useState('');
  /**
   * The open state this render last reacted to.
   *
   * The term is cleared on the way out, and here rather than inside
   * `handleOpenChange`, because a completed pick closes the window through the
   * FIELD: it sets `open` false directly, so a reset hung off the dismissal
   * path alone would reopen showing whatever the researcher searched for a
   * decision ago. Compared during render — both values are ones this render
   * already has, so there is nothing to synchronise from an effect.
   */
  const [openBaseline, setOpenBaseline] = useState(open);
  /**
   * The name a create is currently with the codebook for, held so the row it
   * came from can say so and refuse a second press of the same key.
   *
   * The name rather than a boolean, because the row's words are about a
   * particular name and the box it was read from is held still while the
   * answer is on its way.
   */
  const [creating, setCreating] = useState<string | undefined>(undefined);
  /**
   * Why the last create was refused, in the caller's words, held until the
   * researcher changes the name it is about.
   *
   * Shown HERE rather than on the section that refused it. A refusal is what
   * keeps this window open, and the section behind it is inert while it is —
   * so a sentence left there is one the researcher cannot read until they give
   * up on the name it was written about.
   */
  const [refusedReason, setRefusedReason] = useState<string | undefined>(
    undefined,
  );

  /**
   * How many times this window has been closed, so an answer that arrives
   * after a close can tell that the question it belongs to is over.
   *
   * Counted here, beside the reset, because every close passes through this
   * comparison: the ones the researcher makes and the one a completed pick
   * makes through the field.
   */
  const dismissals = useRef(0);

  if (openBaseline !== open) {
    setOpenBaseline(open);
    if (!open) {
      dismissals.current += 1;
      setTerm('');
      setRefusedReason(undefined);
    }
  }

  const sorted = useMemo(
    () =>
      options.toSorted((first, second) =>
        first.label.localeCompare(second.label, intl.locale),
      ),
    [intl.locale, options],
  );

  const matching = useMemo(() => {
    if (term === '') return sorted;
    const needle = term.toLowerCase();
    return sorted.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [sorted, term]);

  /**
   * Why the typed name cannot be created, or `undefined` while it can.
   *
   * Asked of the whole type rather than of the offered list, and against the
   * schema's own name rule rather than a second opinion about it: the codebook
   * is what refuses the write, and a row that offered a create the codebook
   * would refuse would spend a round trip to say so.
   *
   * Which is why the names are compared through `normalizeForComparison`, the
   * helper `assertVariableNameAvailable` judges a write with: it case-folds
   * and canonicalises, so `AGE` is the name `age` and a decomposed `café` is
   * the precomposed one. A raw comparison here would offer to create a name
   * the codebook holds, and answer with a duplicate-name refusal about a name
   * the researcher believed was free.
   */
  const refusal = useMemo(() => {
    if (term === '') return undefined;
    const typed = normalizeForComparison(term);
    if (
      namesInUse?.some((held) => normalizeForComparison(held) === typed) ===
      true
    ) {
      return intl.formatMessage(messages.nameTaken);
    }
    if (!VariableNameSchema.safeParse(term).success) {
      return intl.formatMessage(messages.nameInvalid);
    }
    return undefined;
  }, [intl, namesInUse, term]);

  /**
   * Whether an attribute on offer already goes by the typed name — asked the
   * codebook's way, so `Name` finds `name` and a decomposed `café` finds the
   * precomposed one. There is nothing to create under a name that is already
   * in the list, and the row that offered it would be a row above its own
   * answer.
   */
  const exactMatch = useMemo(() => {
    const typed = normalizeForComparison(term);
    return options.some(
      (option) => normalizeForComparison(option.label) === typed,
    );
  }, [options, term]);
  const offersCreate = onCreate !== undefined && term !== '' && !exactMatch;

  const rows = useMemo<SpotlightRow[]>(() => {
    const attributes = matching.map((option): SpotlightRow => ({
      id: `${ATTRIBUTE_KEY_PREFIX}${option.value}`,
      kind: 'attribute',
      option,
    }));
    if (!offersCreate) return attributes;
    return [
      refusal === undefined
        ? { id: `create:${term}`, kind: 'create', name: term }
        : {
            id: `refused:${term}`,
            kind: 'refused',
            name: term,
            reason: refusal,
          },
      ...attributes,
    ];
  }, [matching, offersCreate, refusal, term]);

  /**
   * The rows Enter and a click do nothing on: a refused name, and — while a
   * create is with the codebook — every row, because the answer decides what
   * this window does next and a second choice made under it would be lost.
   */
  const disabledKeys = useMemo(
    () =>
      creating === undefined
        ? rows.flatMap((row) => (row.kind === 'refused' ? [row.id] : []))
        : rows.map((row) => row.id),
    [creating, rows],
  );

  const layout = useMemo(() => new ListLayout<SpotlightRow>({ gap: 2 }), []);

  const requestCreate = useCallback(
    async (name: string) => {
      if (onCreate === undefined || creating !== undefined) return;
      const asked = dismissals.current;
      setCreating(name);
      try {
        // A refusal is ABOUT this name, so the window stays open with the name
        // still in the box for the researcher to correct — and whoever refused
        // it has already said why, on the field this window belongs to.
        const outcome = await onCreate(name);
        // Unless the window it was asked from has been dismissed since. The
        // window stays dismissible while a write is out — Architect's never
        // held the researcher there either — so this answer can be about a
        // name they have already walked away from, and the only state left to
        // put it in is the NEXT window's, over whatever they type in it.
        // Dropped, so the next open starts clean. What the codebook actually
        // DID is not dropped with it: the field says an unassigned create in
        // its own notice, which outlives this window.
        if (asked !== dismissals.current) return;
        if (outcome === 'correct-the-name') return;
        if (typeof outcome === 'object') {
          setRefusedReason(outcome.keep);
          return;
        }
        onOpenChange(false);
      } finally {
        setCreating(undefined);
      }
    },
    [creating, onCreate, onOpenChange],
  );

  const choose = useCallback(
    (row: SpotlightRow) => {
      if (row.kind === 'refused') return;
      if (row.kind === 'create') {
        void requestCreate(row.name);
        return;
      }
      onSelect(row.option.value);
    },
    [onSelect, requestCreate],
  );

  const handleSelectionChange = useCallback(
    (keys: Set<Key>) => {
      const [key] = [...keys];
      const row = rows.find((candidate) => candidate.id === key);
      if (row !== undefined) choose(row);
    },
    [choose, rows],
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      // A key pressed to compose a character is not a key press.
      if (event.nativeEvent.isComposing) return;

      // Escape is deliberately not answered here. Closing this window directly
      // would skip Base UI's own dismissal, so its focus manager never runs
      // and focus is left on `<body>` — from where Tab restarts a document
      // walk and steps straight out of whatever dialog this was opened from.
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (rows.length === 0) return;
        event.preventDefault();
        // Focusing the list is all this has to do: the collection takes the
        // first row as its active descendant on entry, and every arrow press
        // after this one is its own roving focus.
        event.currentTarget.ownerDocument.getElementById(resultsId)?.focus();
        return;
      }

      if (event.key !== 'Enter') return;

      // Inventing wins over choosing where both are offered, as it does in
      // Architect: a researcher who has typed a name no attribute carries is
      // asking for that name, and the one result still on screen is whatever
      // happens to contain it.
      if (offersCreate) {
        event.preventDefault();
        if (refusal === undefined) void requestCreate(term);
        return;
      }

      if (matching.length !== 1) return;
      const [only] = matching;
      if (only === undefined) return;
      event.preventDefault();
      onSelect(only.value);
    },
    [
      matching,
      offersCreate,
      onSelect,
      refusal,
      requestCreate,
      resultsId,
      rows.length,
      term,
    ],
  );

  const renderRow = useCallback(
    (row: SpotlightRow, itemProps: ItemProps): ReactNode => {
      if (row.kind === 'attribute') {
        const { option } = row;
        const describedBy =
          option.type === undefined ? undefined : `${itemProps.id}-type`;
        return (
          <div
            {...itemProps}
            aria-describedby={describedBy}
            // On the ROW as well as on the pill inside it: a test and the
            // end-to-end suite ask the list which kinds of answer it is
            // offering, and the row is what they hold.
            data-attribute-type={option.type}
            // What choosing this row would store. The researcher's name for an
            // attribute and the id the protocol files it under are different
            // things, and the list shows only the first — so a test asserting
            // on what a stage ends up holding has nowhere else to read it.
            data-attribute-id={option.value}
            className={ROW_CLASSES}
          >
            <AttributePill name={option.label} type={option.type} />
            {option.type !== undefined && (
              <span id={describedBy} hidden>
                {intl.formatMessage(messages.rowTypeDescription, {
                  attributeType: option.type,
                })}
              </span>
            )}
          </div>
        );
      }

      const busy = creating === row.name;
      return (
        <div {...itemProps} className={cx(ROW_CLASSES, 'gap-3 font-medium')}>
          {row.kind === 'create' ? (
            <Plus aria-hidden className="size-5 shrink-0" />
          ) : (
            <TriangleAlert aria-hidden className="size-5 shrink-0" />
          )}
          <span className="min-w-0">
            {row.kind === 'create'
              ? intl.formatMessage(
                  busy ? messages.createRowBusy : messages.createRow,
                  {
                    attributeName: row.name,
                  },
                )
              : intl.formatMessage(messages.createRowRefused, {
                  attributeName: row.name,
                  reason: row.reason,
                })}
          </span>
        </div>
      );
    },
    [creating, intl],
  );

  const emptyMessage = (() => {
    if (rows.length > 0) return undefined;
    if (onCreate !== undefined) {
      return {
        icon: <Info aria-hidden className="mt-1 mr-3 size-5 shrink-0" />,
        text: intl.formatMessage(messages.firstAttribute, {
          docs: (chunks: ReactNode) => (
            <NativeLink
              key="docs"
              href={protocolAuthoringLinks.attributeNaming}
              target="_blank"
              rel="noopener noreferrer"
            >
              {chunks}
            </NativeLink>
          ),
        }),
      };
    }
    return {
      icon: <TriangleAlert aria-hidden className="mt-1 mr-3 size-5 shrink-0" />,
      text: intl.formatMessage(
        term === '' ? messages.nothingToSelect : messages.nothingMatches,
      ),
    };
  })();

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalPopup
        data-variable-spotlight=""
        finalFocus={finalFocus}
        aria-labelledby={ariaLabelledBy}
        aria-label={
          ariaLabelledBy === undefined
            ? intl.formatMessage(messages.dialogName)
            : undefined
        }
        className="fixed top-10 left-1/2 z-2000 w-xl max-w-[calc(100vw-3rem)] -translate-x-1/2 bg-transparent shadow-none outline-none"
      >
        <MotionSurface
          floating
          noContainer
          spacing="none"
          className="flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden"
        >
          {/*
            Plain boxes, not `<header>` and `<main>`: both are landmarks, and a
            window opened over an editor that has a `main` of its own would put
            a second one in the document.
          */}
          <div className="shrink-0 px-6 py-5">
            <InputField
              autoFocus
              type="search"
              value={term}
              onChange={(next) => {
                // The refusal is about the name that was submitted; changing
                // it is the start of a different question.
                setRefusedReason(undefined);
                setTerm(typeof next === 'string' ? next : '');
              }}
              onKeyDown={handleSearchKeyDown}
              disabled={creating !== undefined}
              prefixComponent={<Search aria-hidden className="size-4" />}
              className="w-full"
              aria-label={intl.formatMessage(messages.searchLabel)}
              placeholder={intl.formatMessage(
                onCreate === undefined
                  ? messages.searchOnlyPlaceholder
                  : messages.searchPlaceholder,
              )}
            />
            {refusedReason !== undefined && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{refusedReason}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="min-h-0 flex-auto pb-2">
            {emptyMessage !== undefined && (
              <div className="flex items-start px-6 pb-5 text-current/80">
                {emptyMessage.icon}
                <Paragraph margin="none">{emptyMessage.text}</Paragraph>
              </div>
            )}
            {rows.length > 0 && (
              <Collection
                id={resultsId}
                aria-label={intl.formatMessage(messages.resultsLabel)}
                items={rows}
                keyExtractor={(row) => row.id}
                textValueExtractor={(row) =>
                  row.kind === 'attribute' ? row.option.label : row.name
                }
                layout={layout}
                renderItem={renderRow}
                selectionMode="single"
                // Always transient: this list asks a question and closes on the
                // answer, so nothing in it is ever "the selected row".
                selectedKeys={[]}
                onSelectionChange={handleSelectionChange}
                disabledKeys={disabledKeys}
                className="h-[min(60vh,28rem)]"
                viewportClassName="scroll-smooth px-3 pb-3"
              >
                {(CollectionElements) => CollectionElements}
              </Collection>
            )}
          </div>
        </MotionSurface>
      </ModalPopup>
    </Modal>
  );
}
