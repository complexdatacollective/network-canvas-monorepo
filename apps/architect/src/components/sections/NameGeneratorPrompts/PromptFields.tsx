import { useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import AssignAttributes, {
  committedAttributeVariableIds,
  makeAssignAttributesValidation,
  type AttributeValue,
  type VariableOption,
} from '~/components/Form/arrayFields/AssignAttributes';
import PromptText from '~/components/sections/PromptText';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';
import { draftFormFieldVariableIds } from '~/components/Validations/draftWriterRoles';
import type { RootState } from '~/ducks/modules/root';
import {
  EMPTY_VARIABLES,
  getVariableOptionsForSubject,
  getVariablesForSubject,
} from '~/selectors/codebook';
import {
  getVariableRoleMapOutsideStage,
  roleMapKey,
} from '~/selectors/indexes';
import {
  excludeInterfaceOwned,
  excludeValidatedUses,
} from '~/selectors/roleFilters';

/**
 * Stable identities for the empty cases. `EMPTY_ATTRIBUTES` feeds
 * `ArchitectArrayField`'s `initialValue`, which is a dependency of the field's
 * register effect — a fresh `[]` per render would re-register the field — and
 * all three feed `AssignAttributes`' memoized row context.
 */
const EMPTY_ATTRIBUTES: AttributeValue[] = [];
const EMPTY_VARIABLE_OPTIONS: VariableOption[] = [];
const NO_DRAFT_VARIABLES: ReadonlySet<string> = new Set();

/**
 * additionalAttributes stamps are UNVALIDATED writers (the interview writes
 * the configured boolean straight onto the node, bypassing codebook
 * validation), so the shared row pool drops options a form elsewhere already
 * validates. `committedVariables` is every row's COMMITTED pick — the
 * multi-row form of the usual currentValue escape, so an existing row keeps
 * rendering its selection.
 *
 * Exported for `sections/__tests__/pickerExclusions.test.ts`, which pins this
 * exclusion direction against the opposite-direction quickAdd pickers.
 */
export const getAdditionalAttributesOptionsForSubject = (
  state: RootState,
  subject: { entity: 'node' | 'edge' | 'ego'; type: string },
  committedVariables?: readonly string[],
  excludedStageIndex?: number,
) =>
  // It also drops a variable an interface derives from the structure a
  // participant builds — a Family Pedigree's participant marker is a boolean
  // like any other, and setting it here would put several people in one family.
  excludeInterfaceOwned(
    state,
    subject,
    excludeValidatedUses(
      state,
      subject,
      getVariableOptionsForSubject(state, subject),
      committedVariables,
      excludedStageIndex,
    ),
    committedVariables,
  );

type PromptFieldsProps = {
  entity?: 'node' | 'edge' | 'ego' | null;
  type?: string | null;
  text?: string;
  /**
   * The row's committed `additionalAttributes`: both the array field's
   * `initialValue` and the cross-class gate's escape hatch (reselecting what
   * this prompt already saved is never a new contradiction).
   */
  additionalAttributes?: AttributeValue[];
  currentStageIndex?: number;
};

const PromptFields = ({
  entity = null,
  type = null,
  text,
  additionalAttributes = EMPTY_ATTRIBUTES,
  currentStageIndex,
}: PromptFieldsProps) => {
  // ONE committed-pick set, shared by all three layers that need the same
  // escape: the picker pool below, the row's displayed cross-class error, and
  // the array field's blocking rule. Membership, never a row's position — see
  // `committedAttributeVariableIds`.
  const committedVariableIds = useMemo(
    () => committedAttributeVariableIds(additionalAttributes),
    [additionalAttributes],
  );
  const committedVariables = useMemo(
    () => [...committedVariableIds],
    [committedVariableIds],
  );

  // The outer stage's live form fields, read from the stage store rather than
  // this dialog's own: a variable a not-yet-saved form field on THIS stage
  // already collects must not be offered here either.
  const draftFormFields = useStageFormValue('form.fields');
  const draftValidatedVariables = useMemo(
    () =>
      draftFormFields
        ? draftFormFieldVariableIds(draftFormFields)
        : NO_DRAFT_VARIABLES,
    [draftFormFields],
  );

  const subject = useMemo(
    () => (entity && type ? { entity, type } : null),
    [entity, type],
  );

  const variableOptions = useSelector(
    (state: RootState) =>
      subject
        ? getAdditionalAttributesOptionsForSubject(
            state,
            subject,
            committedVariables,
            currentStageIndex,
          )
        : EMPTY_VARIABLE_OPTIONS,
    // The role filter allocates a fresh array each call; compare its elements
    // (already stable) so unrelated store updates don't re-render the rows.
    shallowEqual,
  );

  const draftSafeOptions = useMemo(
    () =>
      variableOptions.filter(
        ({ value }) =>
          !draftValidatedVariables.has(value) ||
          committedVariableIds.has(value),
      ),
    [committedVariableIds, draftValidatedVariables, variableOptions],
  );

  // The gate's two authoritative sources, read once here rather than per row:
  // saved roles outside the stage being edited, and the subject's codebook
  // (for the message's display name).
  const roleMap = useSelector((state: RootState) =>
    getVariableRoleMapOutsideStage(state, currentStageIndex),
  );
  const allVariables = useSelector((state: RootState) =>
    subject ? getVariablesForSubject(state, subject) : EMPTY_VARIABLES,
  );

  /**
   * Built per instance — the cross-class rule has to close over THIS prompt's
   * committed picks and this stage's live form roles, which no module-level
   * constant can carry. Memoized on those real inputs so the field's props do
   * not churn a fresh object every render.
   */
  const validation = useMemo(
    () =>
      makeAssignAttributesValidation({
        allVariables,
        committedVariableIds,
        draftValidatedVariables,
        hasValidatedUseElsewhere: (variableId) =>
          subject !== null &&
          (roleMap[roleMapKey(subject, variableId)]?.validated ?? 0) > 0,
      }),
    [
      allVariables,
      committedVariableIds,
      draftValidatedVariables,
      roleMap,
      subject,
    ],
  );

  return (
    <>
      <PromptText initialValue={text} />
      <Section
        title="Assign Additional Variables"
        summary={
          <Paragraph>
            This feature allows you to assign a variable and associated value to
            any nodes created on this prompt. You could then use this variable
            in your skip logic or stage filtering rules.
          </Paragraph>
        }
        layout="vertical"
      >
        <Row>
          {/*
            The field only mounts once a node type is chosen: with no subject
            there is no pool to pick from and nothing to validate. Hoisting it
            out of this guard would register `additionalAttributes` on prompts
            that never had it and — through the dialog's overwrite save — write
            an empty key onto them.
          */}
          {subject && (
            <ArchitectArrayField
              name="additionalAttributes"
              label="Additional variables to assign"
              labelHidden
              component={AssignAttributes}
              initialValue={additionalAttributes}
              entity={subject.entity}
              type={subject.type}
              variableOptions={draftSafeOptions}
              draftValidatedVariables={draftValidatedVariables}
              currentStageIndex={currentStageIndex}
              committedVariableIds={committedVariableIds}
              // The rows' own rules are display-only (see `RowField`), so both
              // of them have to exist here too or the dialog saves what it has
              // just refused in red: a half-finished stamp, or a variable a
              // form elsewhere already collects.
              // `NameGeneratorRosterPrompts` shares this component, so both
              // stages are covered from here.
              validation={validation}
            />
          )}
        </Row>
      </Section>
    </>
  );
};

export default PromptFields;
