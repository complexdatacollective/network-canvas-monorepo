import { useCallback, useMemo, useRef } from 'react';

import type {
  Codebook,
  VariableType,
  Variables,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { sectionIdForCodebookSubject } from '../../codebook/editing.ts';
import {
  buildExclusiveVariableSlotMap,
  buildInterfaceOwnedOptionMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
  interfaceOwnedPickIssue,
  lockedVariableOptions,
  type LockedOptionList,
  variableRoleKey,
  type WriterClass,
} from '../../codebook/variableRoles.ts';
import {
  type CrossClassPick,
  crossClassPickErrors,
} from '../../codebook/variableValidation.ts';
import type { VariablePickerOption } from '../../fields/VariablePicker.tsx';
import type { DialogArrayEditorValidate } from '../../form/arrayFields/DialogArrayField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { ruleVariables } from '../../rules/ruleCodebook.ts';

/**
 * How a prompt reaches the codebook.
 *
 * Everything a bin or census prompt asks about an attribute — which ones it
 * may offer, whether their options may be edited here, and which picks a save
 * has to refuse — is one question asked of the editor's own protocol context.
 * Nothing here takes a codebook prop, a selector or a host store: a section
 * renders a picker, and a collaborator's change to the codebook reaches it
 * because the context it read is the session's.
 *
 * The Architect originals are `~/selectors/roleFilters`,
 * `~/components/Options/getLockedOptions` and
 * `~/components/sections/useCrossClassEditorValidate`, which asked the same
 * questions of a Redux store.
 */

const EMPTY_OPTIONS: readonly VariablePickerOption[] = Object.freeze([]);

/** A stage subject or an edge type a prompt named, as a codebook subject. */
const codebookSubjectOf = (value: unknown): CodebookSubject | null => {
  if (typeof value !== 'object' || value === null) return null;
  const entity: unknown = Reflect.get(value, 'entity');
  const type: unknown = Reflect.get(value, 'type');
  if (entity === 'ego') return { entity: 'ego' };
  if (typeof type !== 'string' || type === '') return null;
  if (entity === 'node') return { entity: 'node', type };
  if (entity === 'edge') return { entity: 'edge', type };
  return null;
};

/** The edge type a census prompt creates, as a codebook subject. */
export const edgeSubjectOf = (typeId: unknown): CodebookSubject | null =>
  typeof typeId === 'string' && typeId !== ''
    ? { entity: 'edge', type: typeId }
    : null;

/**
 * What this stage works on, read from the draft rather than passed in.
 *
 * Every prompt in this family describes the stage's own subject, and that can
 * change while the prompts section is open — the subject section throws the
 * prompts away when it does — so it is read live.
 */
export function useStageSubject(): CodebookSubject | null {
  const subject = useStageValue('subject');
  return useMemo(() => codebookSubjectOf(subject), [subject]);
}

const variablesFor = (
  codebook: Readonly<Codebook>,
  subject: CodebookSubject,
): Readonly<Variables> =>
  ruleVariables(
    codebook,
    subject.entity,
    subject.entity === 'ego' ? undefined : subject.type,
  );

const optionsFor = (
  variables: Readonly<Variables>,
  types?: readonly VariableType[],
): VariablePickerOption[] =>
  Object.entries(variables).flatMap<VariablePickerOption>(
    ([variableId, definition]) => {
      if (types !== undefined && !types.includes(definition.type)) return [];
      return [
        {
          value: variableId,
          label: definition.name === '' ? variableId : definition.name,
          type: definition.type,
        },
      ];
    },
  );

/** Reads a pick out of a row by the path it is reported under. */
const stringAtPath = (row: unknown, path: string): string => {
  let current: unknown = row;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return '';
    current = Reflect.get(current, segment);
  }
  return typeof current === 'string' ? current : '';
};

export type PromptVariablePoolInput = Readonly<{
  subject: CodebookSubject | null;
  /**
   * Only these attribute types can answer this prompt. Pass a constant: it is
   * a memoisation dependency, and a fresh array per render rebuilds the pool
   * on every keystroke in the dialog.
   */
  types: readonly VariableType[];
  /**
   * Which class of writer the picker itself is. A bin, a census or a highlight
   * assigns its value directly and must drop attributes a form elsewhere
   * already validates; a picker whose control honours the attribute's own
   * codebook validation drops the ones an unvalidated writer already claims.
   */
  writerClass: WriterClass;
  /** The picker's current pick, which is always kept on offer. */
  currentValue: string | undefined;
}>;

/**
 * The attributes this picker may offer.
 *
 * Three exclusions, in Architect's own order: the attribute types this prompt
 * can use at all, then the opposite writer class's existing claims, then the
 * attributes an interface derives from the structure a participant builds.
 * This stage's own saved uses are excluded from the role map, so reopening a
 * prompt never hides the attribute it already names.
 */
export function usePromptVariablePool({
  subject,
  types,
  writerClass,
  currentValue,
}: PromptVariablePoolInput): readonly VariablePickerOption[] {
  const { controller } = useStageEditorForm();
  const { protocolContext, editedSection } = controller.snapshot;
  const stageId = editedSection.identity.id;

  return useMemo(() => {
    if (subject === null) return EMPTY_OPTIONS;
    const pool = optionsFor(
      variablesFor(protocolContext.codebook, subject),
      types,
    );
    const roleMap = buildVariableRoleMap(protocolContext, stageId);
    const withoutConflicts =
      writerClass === 'unvalidated'
        ? excludeValidatedUses(roleMap, subject, pool, currentValue)
        : excludeUnvalidatedUses(roleMap, subject, pool, currentValue);
    return excludeInterfaceOwned(
      buildExclusiveVariableSlotMap(protocolContext),
      subject,
      withoutConflicts,
      currentValue,
    );
  }, [currentValue, protocolContext, stageId, subject, types, writerClass]);
}

/**
 * Every attribute of the subject, unfiltered — the pool a sort rule draws
 * from.
 *
 * A sort key READS an attribute rather than writing it, so it sits outside the
 * writer-exclusivity rule entirely: a bin may legitimately be sorted by an
 * attribute a form elsewhere collects, and filtering those out would drop a
 * sort rule an imported protocol already has.
 */
export function useSortVariablePool(
  subject: CodebookSubject | null,
): readonly VariablePickerOption[] {
  const { controller } = useStageEditorForm();
  const { protocolContext } = controller.snapshot;

  return useMemo(() => {
    if (subject === null) return EMPTY_OPTIONS;
    return optionsFor(variablesFor(protocolContext.codebook, subject));
  }, [protocolContext, subject]);
}

/**
 * The option list this attribute's editor must render read-only, or
 * `undefined` when the researcher may change it.
 */
export function useLockedOptions(
  subject: CodebookSubject | null,
  variableId: string | undefined,
): LockedOptionList | undefined {
  const { controller } = useStageEditorForm();
  const { protocolContext } = controller.snapshot;

  return useMemo(() => {
    if (subject === null || variableId === undefined) return undefined;
    return lockedVariableOptions(
      variablesFor(protocolContext.codebook, subject),
      variableId,
      buildInterfaceOwnedOptionMap(protocolContext)[
        variableRoleKey(subject, variableId)
      ],
    );
  }, [protocolContext, subject, variableId]);
}

/**
 * The codebook section a variable editor writes into, exactly as the
 * authoritative protocol holds it.
 *
 * The section DOCUMENT rather than the parsed definition: a compound edit
 * carries the content hash of what it was built from, so anything read for one
 * has to be the authoritative document itself.
 */
export function useCodebookSectionDocument(
  subject: CodebookSubject | null,
): Readonly<SectionDoc> | null {
  const { controller } = useStageEditorForm();
  const { protocolSections } = controller.snapshot;

  return useMemo(() => {
    if (subject === null) return null;
    return protocolSections[sectionIdForCodebookSubject(subject)] ?? null;
  }, [protocolSections, subject]);
}

export type PromptPickGateInput = Readonly<{
  /** Every attribute picker this row editor owns, with its own writer class. */
  picks: readonly CrossClassPick[];
  /**
   * The codebook subject the row's picks belong to, derived from the row: a
   * Tie-Strength Census prompt chooses its edge type inside itself, so this
   * cannot be fixed when the section mounts.
   */
  subjectForRow: (row: Record<string, unknown>) => CodebookSubject | null;
}>;

/**
 * The save-time refusals for one prompt's attribute picks.
 *
 * Two rules, both of which the pickers above already enforce by omission — so
 * what reaches here is a stale draft or an imported protocol, which is exactly
 * what has to be explained rather than quietly saved:
 *
 * - the cross-class exclusivity rule, which escapes a pick this edit did not
 *   change (`context.initialValues` is the row as the dialog opened on it);
 * - the interface-owned structural slot rule, which has NO such escape:
 *   re-saving the pick would keep overwriting the value the owning interface
 *   derives for itself.
 *
 * The returned callback keeps one identity for the life of the section. It
 * runs on submit rather than on render, so it reads the current protocol
 * through a ref instead of subscribing the section to a codebook it only ever
 * consults at save time.
 */
export function usePromptPickGate({
  picks,
  subjectForRow,
}: PromptPickGateInput): DialogArrayEditorValidate {
  const { controller } = useStageEditorForm();
  const latest = useRef({ controller, picks, subjectForRow });
  latest.current = { controller, picks, subjectForRow };

  return useCallback((values, context) => {
    const current = latest.current;
    const subject = current.subjectForRow(values);
    if (subject === null) return undefined;

    const protocolContext = current.controller.snapshot.protocolContext;
    const errors: Record<string, string> = {
      ...crossClassPickErrors({
        values,
        initialValues: context?.initialValues,
        picks: current.picks,
        subject,
        roleMap: buildVariableRoleMap(protocolContext),
        allVariables: variablesFor(protocolContext.codebook, subject),
      }),
    };

    const slotMap = buildExclusiveVariableSlotMap(protocolContext);
    for (const { path } of current.picks) {
      if (errors[path] !== undefined) continue;
      const ownedIssue = interfaceOwnedPickIssue(
        slotMap,
        subject,
        stringAtPath(values, path),
      );
      if (ownedIssue !== undefined) errors[path] = ownedIssue;
    }

    return Object.keys(errors).length === 0 ? undefined : errors;
  }, []);
}
