import { isEqual } from 'es-toolkit/compat';
import { Trash2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ComponentType,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import {
  stripManagedProperties,
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Surface from '@codaco/fresco-ui/layout/Surface';
import type { Variables } from '@codaco/protocol-validation';

import {
  buildVariableRoleMap,
  hasValidatedUse,
} from '../../codebook/variableRoles.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { variablesForSubject } from '../../protocol-context.ts';
import { useStageEditorForm } from '../stageEditorContext.ts';
import { readRows } from './arrayFieldCommands.ts';
import {
  crossClassPickIssue,
  draftValidatedElsewhereMessage,
  validatedElsewhereMessage,
  variableDisplayName,
} from './crossClassPick.ts';
import RowField from './RowField.tsx';
import { requiredRow, type RowValidator } from './rowValidators.ts';

const FrescoBooleanControl = FrescoBooleanField as ComponentType<
  Record<string, unknown>
>;

export type VariableOption = {
  disabled?: boolean;
  isUsed?: boolean;
  label: string;
  type?: string;
  value: string;
};

export type AttributeValue = {
  variable?: string;
  value?: boolean;
};

/** Creates a codebook variable and answers with its id, or nothing on refusal. */
export type CreateAttributeVariable = (
  variableName: string,
) => Promise<string | undefined>;

export type AssignAttributesContextValue = {
  /** Resolved name of the array field these rows belong to. */
  arrayName: string;
  subject: CodebookSubject;
  /** The shared pool, already narrowed to assignable types. */
  variableOptions: VariableOption[];
  /**
   * The control that picks (and optionally creates) a codebook variable.
   *
   * Injected rather than imported: the picker is a host surface — it knows how
   * that host lists, groups and creates variables — while everything else here
   * is list mechanics the package owns.
   */
  variablePickerComponent: ComponentType<Record<string, unknown>>;
  onCreateVariable?: CreateAttributeVariable;
  draftValidatedVariables: ReadonlySet<string>;
  /**
   * Every variable id the array's COMMITTED value holds — the escape hatch for
   * the cross-class gate: reselecting what is already saved is never a NEW
   * contradiction. See `committedAttributeVariableIds` for why this is a set
   * and not the committed array itself.
   */
  committedVariableIds: ReadonlySet<string>;
  /**
   * Reveal every row's errors without waiting for an edit, set once the array
   * field is showing `completeAttributes`' refusal — otherwise the save is
   * blocked by a message that never says which row is incomplete.
   */
  forceShowErrors: boolean;
};

export const AssignAttributesContext =
  createContext<AssignAttributesContextValue | null>(null);

const useAssignAttributesContext = () => {
  const context = useContext(AssignAttributesContext);
  if (!context) {
    throw new Error('Attribute rows must be rendered inside AssignAttributes.');
  }
  return context;
};

const messages = defineMessages({
  booleanTrue: {
    id: 'protocolBuilder.assignAttributes.booleanTrue',
    defaultMessage: 'True',
    description:
      'One of the two values a prompt can stamp onto every node it creates, for an attribute that records a yes/no answer. A prompt is the question a participant reads.',
  },
  booleanFalse: {
    id: 'protocolBuilder.assignAttributes.booleanFalse',
    defaultMessage: 'False',
    description:
      'The other of the two values a prompt can stamp onto every node it creates, for an attribute that records a yes/no answer.',
  },
  unassignedTitle: {
    id: 'protocolBuilder.assignAttributes.unassignedTitle',
    defaultMessage: '“{variableName}” was created but not assigned',
    description:
      'Title of the notice shown when a codebook attribute the researcher created from a row was created successfully but could not be put into that row. variableName is the name they typed and is not translated.',
  },
  rowReplaced: {
    id: 'protocolBuilder.assignAttributes.rowReplaced',
    defaultMessage:
      'The row you created “{variableName}” from was replaced while it was being created, so nothing has been assigned to it. Select “{variableName}” in the row you want it in.',
    description:
      'Body of that notice, for when the row the researcher started from has been replaced by a different one. variableName is the attribute name they typed and is not translated.',
  },
  listClosed: {
    id: 'protocolBuilder.assignAttributes.listClosed',
    defaultMessage:
      '“{variableName}” was created, but this list stopped accepting changes while it was being created, so nothing has been assigned to it. Select “{variableName}” in the row you want it in once the list can be edited.',
    description:
      'Body of that notice, for when the list stopped accepting changes while the attribute was being created. variableName is the attribute name the researcher typed and is not translated.',
  },
  rowGone: {
    id: 'protocolBuilder.assignAttributes.rowGone',
    defaultMessage:
      '“{variableName}” was created, but the row it was created from is no longer in this list, so nothing has been assigned to it. Select “{variableName}” in the row you want it in.',
    description:
      'Body of that notice, for when the row the researcher started from has left the list altogether. variableName is the attribute name they typed and is not translated.',
  },
  variableLabel: {
    id: 'protocolBuilder.assignAttributes.variableLabel',
    defaultMessage: 'Create or select an attribute',
    description:
      'Label of the control that picks (or adds) the codebook attribute this row stamps onto every node the prompt creates.',
  },
  valueLabel: {
    id: 'protocolBuilder.assignAttributes.valueLabel',
    defaultMessage: 'Value to assign',
    description:
      'Label of the control that chooses which value this row stamps onto every node the prompt creates.',
  },
  valueHint: {
    id: 'protocolBuilder.assignAttributes.valueHint',
    defaultMessage: 'Every node created on this prompt is given this value.',
    description:
      'Hint under the value control, saying what stamping means: a node is a member of the interview network, and a prompt is the question a participant reads.',
  },
  deleteRow: {
    id: 'protocolBuilder.assignAttributes.deleteRow',
    defaultMessage: 'Delete attribute',
    description:
      'Accessible name of the button that removes one row from the list of attributes a prompt stamps onto the nodes it creates. It removes the row, not the attribute from the codebook.',
  },
});

const REQUIRED_ONLY: readonly RowValidator[] = [requiredRow()];

/**
 * The three things the creation round trip can outlive, in the words the
 * researcher reads.
 *
 * `rowReplaced` is said when the row a new attribute was created from is no
 * longer that row. `listClosed` is said when the list stopped accepting
 * changes while the attribute was being created — a lost lease, a section
 * whose prerequisite stopped being chosen — which `ArrayField` reports only by
 * withdrawing the row’s update handler: an optional call assigns nothing and
 * says nothing, which reads as an assignment that worked. `rowGone` is said
 * when the assignment reached no row at all, the one case re-checking this
 * control cannot see for itself: a row that has left the list stops being
 * rendered — `ArrayField` even keeps its editor mounted on frozen props while
 * it animates out — so the row it last saw still reads as unchanged and the
 * handler it last had still reads as live. `onUpdate` answering for itself is
 * what turns that into something to say.
 *
 * All three report where the attribute WENT rather than a failure: creating it
 * is the host’s write, and it succeeded. Formatted here rather than encoded,
 * because they are handed straight to the notice as its description, which
 * renders whatever it is given.
 */

/**
 * Every variable id an array's COMMITTED value holds.
 *
 * Rows carry no stable identity. `committedValue` is frozen when the dialog
 * opens, while row indices renumber the moment a row is deleted — so
 * `committedValue[rowIndex]` resolves a SURVIVING row against a DELETED row's
 * saved pick: a false "collected elsewhere" accusation against a row's own
 * untouched selection, and a silent pass for the row that reselects the
 * vanished one. The escape's question is a MEMBERSHIP one: a variable this
 * prompt already saved is not a NEW contradiction, whichever row now holds it.
 *
 * This deliberately does NOT read fresco-ui's `committedIndex`, which tracks
 * the LIVE value (it keeps field paths attached to items during drag
 * previews); reading the live value here would escape every fresh pick and the
 * gate would never fire at all.
 *
 * The argument is whatever the stage document holds at the array's key, not
 * something a caller has already vetted — a host builds this from that value
 * inside its own `useMemo`, in its own render path. An import, a migration or
 * a mid-cascade reseed can leave a list holding an entry that is not a row at
 * all, and destructuring one throws out of that render, taking down the
 * editor before the render-tolerant control this whole package is built around
 * ever draws. So it reads its rows the way every other reader here does, with
 * `readRows` — see `renderedRows` in `arrayFieldCommands`, and fresco-ui's
 * render-tolerance contract (#1433).
 */
export const committedAttributeVariableIds = (
  committedValue?: unknown,
): ReadonlySet<string> =>
  new Set(
    readRows(committedValue)
      .map((row) => row.variable)
      .filter(
        (variable): variable is string =>
          typeof variable === 'string' && variable !== '',
      ),
  );

export type AssignAttributesCrossClassContext = {
  /** The subject's codebook variables, read only for display names. */
  allVariables: Readonly<Variables>;
  /** See `committedAttributeVariableIds`. */
  committedVariableIds: ReadonlySet<string>;
  /** Variables this stage's LIVE (unsaved) form fields already collect. */
  draftValidatedVariables: ReadonlySet<string>;
  /** Whether a SAVED form outside this stage already validates the variable. */
  hasValidatedUseElsewhere: (variableId: string) => boolean;
};

/**
 * The cross-class gate for ONE pick: this stamp is an UNVALIDATED writer, so
 * its variable may not be one a form elsewhere already collects. Saved roles
 * from other stages and this stage's live form fields are the authoritative
 * sources; this stage's saved roles are stale once editing begins.
 *
 * Shared verbatim by the row's DISPLAYED error and the owning array field's
 * BLOCKING rule (`makeAssignAttributesValidation`). A `RowField` error can
 * only display — nothing there reaches the form's validity — so an error with
 * no array-level counterpart is a contradiction the researcher is shown and
 * then invited to save. The two layers must therefore be one function, escape
 * included: an escape that differed by even a row's identity would have one
 * layer refuse what the other renders as fine.
 */
export const assignAttributeCrossClassIssue = (
  variableId: string,
  {
    allVariables,
    committedVariableIds,
    draftValidatedVariables,
    hasValidatedUseElsewhere,
  }: AssignAttributesCrossClassContext,
): string | undefined => {
  if (!variableId) return undefined;
  const isCommittedPick = committedVariableIds.has(variableId);
  if (draftValidatedVariables.has(variableId) && !isCommittedPick) {
    return draftValidatedElsewhereMessage(
      variableDisplayName(allVariables, variableId),
    );
  }
  return crossClassPickIssue({
    variableId,
    // `crossClassPickIssue` escapes a single unchanged pick; membership is
    // expressed by handing a committed pick its own id.
    originalVariableId: isCommittedPick ? variableId : '',
    hasConflictingUse: hasValidatedUseElsewhere,
    allVariables,
    message: validatedElsewhereMessage,
  });
};

/** One "assign this boolean to every node created here" row. */
export default function Attribute({
  item,
  index,
  committedIndex,
  onUpdate,
  onDelete,
  disabled,
  readOnly,
}: ArrayFieldItemProps<AttributeValue>) {
  const {
    arrayName,
    subject,
    variableOptions,
    variablePickerComponent,
    onCreateVariable,
    draftValidatedVariables,
    committedVariableIds,
    forceShowErrors,
  } = useAssignAttributesContext();
  const intl = useAppIntl();
  const { protocolContext, identity } = useStageEditorForm();
  const { openDialog } = useDialog();
  const booleanOptions = useMemo(
    () => [
      { label: intl.formatMessage(messages.booleanTrue), value: true },
      { label: intl.formatMessage(messages.booleanFalse), value: false },
    ],
    [intl],
  );
  // Read when the creation COMPLETES, not when the row was drawn: the whole
  // point is that the two are different moments. The handler is read the same
  // way and for the same reason — `ArrayField` withdraws it while the list is
  // not accepting changes, which can happen inside that window too.
  const rowRef = useRef(item);
  rowRef.current = item;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  // A DISPLAY path only — the `data-field-name` seam E2E specs target. It is
  // the live position (fresco-ui's `committedIndex` holds it steady through a
  // drag preview) and is never an identity: nothing about this row's VALUE may
  // be looked up by it. See `committedAttributeVariableIds`.
  const rowFieldName = `${arrayName}[${committedIndex ?? index}]`;
  const variable =
    typeof item.variable === 'string' ? item.variable : undefined;

  // The DISPLAY half of the cross-class gate. Its blocking counterpart is the
  // owning array field's `crossClassPicks` rule, which runs this identical
  // function — see `assignAttributeCrossClassIssue`.
  //
  // The role map excludes the stage being edited, because this form's own
  // unsaved fields are the authority on what this stage collects, and the
  // saved copy of them is stale the moment editing begins.
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );
  const allVariables = useMemo(
    () => variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const crossClassValidate = useCallback<RowValidator>(
    (value) =>
      assignAttributeCrossClassIssue(typeof value === 'string' ? value : '', {
        allVariables,
        committedVariableIds,
        draftValidatedVariables,
        hasValidatedUseElsewhere: (id) => hasValidatedUse(roleMap, subject, id),
      }),
    [
      allVariables,
      committedVariableIds,
      draftValidatedVariables,
      roleMap,
      subject,
    ],
  );

  const variableValidators = useMemo<readonly RowValidator[]>(
    () => [requiredRow(), crossClassValidate],
    [crossClassValidate],
  );

  // Answered rather than fired and forgotten: the picker keeps the name the
  // researcher typed until it hears the attribute exists, because a refusal is
  // about that name.
  const handleCreateOption = onCreateVariable
    ? async (variableName: string): Promise<boolean> => {
        // The row this creation was started FROM, as it stands right now.
        // Creating a codebook variable is a round trip through the host, and
        // the list carries on moving while it runs — a collaborator's
        // insertion, an undo, a rollback after a lost lease. These rows carry
        // no id of their own, so `onUpdate` is bound to an internal id
        // `ArrayField` infers from the row's content when the value is
        // replaced: a row that has itself been edited meanwhile — or one of
        // two rows nothing can tell apart — leaves this handle naming a row
        // the researcher never looked at, and the new variable is stamped onto
        // that one's attribute.
        //
        // Content is the only identity such a row has, and it is enough for
        // the same reason it is enough in `useConfirmRowRemoval`: two rows the
        // researcher cannot tell apart are two rows this control described
        // identically.
        const createdFrom = stripManagedProperties(rowRef.current);
        // Answered rather than fired and forgotten: the picker keeps the name
        // the researcher typed until it hears the attribute exists, because a
        // refusal is about that name.
        const created = await onCreateVariable(variableName);
        if (created === undefined) return false;
        // Both of these are read when the creation COMPLETES: which row this
        // control now names, and whether the list will still take a write to
        // it. Either can have changed inside the round trip, and neither is
        // something the assignment itself would report.
        const assign = onUpdateRef.current;
        const stillTheSameRow = isEqual(
          stripManagedProperties(rowRef.current),
          createdFrom,
        );
        const unassigned = async (description: string) => {
          await openDialog({
            type: 'acknowledge',
            intent: 'warning',
            title: intl.formatMessage(messages.unassignedTitle, {
              variableName,
            }),
            description,
            actions: {
              primary: {
                label: intl.formatMessage(commonMessages.continue),
                value: true,
              },
            },
          });
        };

        if (!stillTheSameRow || assign === undefined) {
          await unassigned(
            intl.formatMessage(
              stillTheSameRow ? messages.listClosed : messages.rowReplaced,
              { variableName },
            ),
          );
          return false;
        }
        // The last thing the two guards above cannot see: a row that has
        // left the list while this control was still rendering it, or was
        // rendering nothing at all. Neither refreshes the values those
        // guards read, so the write itself is what has to answer — see
        // `onUpdate` in fresco-ui's `ArrayFieldItemProps`.
        if (assign({ variable: created }) === false) {
          await unassigned(
            intl.formatMessage(messages.rowGone, { variableName }),
          );
          return false;
        }
        return true;
      }
    : undefined;

  return (
    <Surface className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-8">
      {/* Fields carry their own bottom margin, so this column just stacks. */}
      <div>
        <RowField
          name={`${rowFieldName}.variable`}
          label={intl.formatMessage(messages.variableLabel)}
          component={variablePickerComponent}
          value={variable}
          onChange={(value: unknown) =>
            onUpdate?.({
              variable: typeof value === 'string' ? value : undefined,
            })
          }
          validators={variableValidators}
          forceShowErrors={forceShowErrors}
          options={variableOptions}
          onCreateOption={handleCreateOption}
          entity={subject.entity}
          type={subject.entity === 'ego' ? undefined : subject.type}
          disabled={disabled || readOnly}
        />
        {variable && (
          <RowField
            name={`${rowFieldName}.value`}
            label={intl.formatMessage(messages.valueLabel)}
            hint={intl.formatMessage(messages.valueHint)}
            component={FrescoBooleanControl}
            value={item.value}
            onChange={(value: unknown) =>
              onUpdate?.({
                value: typeof value === 'boolean' ? value : undefined,
              })
            }
            validators={REQUIRED_ONLY}
            forceShowErrors={forceShowErrors}
            options={booleanOptions}
            noReset
            disabled={disabled || readOnly}
          />
        )}
      </div>
      <IconButton
        icon={<Trash2 />}
        aria-label={intl.formatMessage(messages.deleteRow)}
        color="destructive"
        disabled={disabled || readOnly}
        onClick={onDelete}
      />
    </Surface>
  );
}
