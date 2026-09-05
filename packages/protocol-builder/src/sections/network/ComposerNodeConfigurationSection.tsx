import { useMemo } from 'react';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import {
  hasUnvalidatedUse,
  hasValidatedUse,
} from '../../codebook/variableRoles.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '../../form/arrayFields/crossClassPick.ts';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import {
  CATEGORICAL_TYPES,
  LAYOUT_TYPES,
  TEXT_TYPES,
  useStageSubject,
  useSubjectVariables,
  useVariableOptions,
  useVariableRoleMap,
} from './codebookOptions.ts';
import CreateVariableAction, {
  useSetStageFieldValue,
} from './CreateVariableAction.tsx';
import { asText } from './rowValues.ts';

const QUICK_ADD_FIELD = 'quickAdd';
const LAYOUT_VARIABLE_FIELD = 'layoutVariable';
const AUTOMATIC_LAYOUT_FIELD = 'behaviours.automaticLayout';
const CONVEX_HULL_FIELD = 'convexHullVariable';

/**
 * The refusal a VALIDATED writer earns by taking an attribute something else
 * already writes around the codebook's rules.
 *
 * The opposite direction has a message of its own in the package's shared
 * cross-class helper. This one belongs to a form-shaped picker, and says what
 * the researcher would have to change to make the pick legal.
 */
const unvalidatedElsewhereMessage = (variableName: string): string =>
  `"${variableName}" is already written directly by another part of this protocol, so a form here would validate values it did not collect. Choose a different attribute.`;

export type ComposerNodeConfigurationCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /** Said instead of `description` while the section is waiting on a subject. */
  waitingDescription: string;
  quickAddLabel: string;
  quickAddHint: string;
  createQuickAddLabel: string;
  layoutLabel: string;
  layoutHint: string;
  createLayoutLabel: string;
  automaticLayoutLabel: string;
  automaticLayoutHint: string;
  hullLabel: string;
  hullHint: string;
  createHullLabel: string;
}>;

const DEFAULT_COPY: ComposerNodeConfigurationCopy = {
  sectionTitle: 'Adding and arranging nodes',
  description:
    'How the participant adds nodes to the canvas, where those nodes sit, and how they group them.',
  waitingDescription:
    'Choose what this stage works with before configuring how its nodes behave.',
  quickAddLabel: 'Attribute filled in when a node is added',
  quickAddHint:
    'The participant types one thing to add a node — usually a name. It is stored in this attribute, and checked against the rules the codebook gives it.',
  createQuickAddLabel: 'Create a new attribute to fill in',
  layoutLabel: 'Position attribute',
  layoutHint:
    "The attribute that stores each node's position. Stages sharing an attribute carry the participant's placements between them.",
  createLayoutLabel: 'Create a new position attribute',
  automaticLayoutLabel: 'Start with automatic layout switched on',
  automaticLayoutHint:
    'Arranges the nodes by simulating attraction and repulsion. The participant can switch this off and on during the interview; this is only where it starts.',
  hullLabel: 'Grouping attribute',
  hullHint:
    'Nodes sharing a value of this attribute are drawn inside a shaded outline. The participant sets those values on the canvas, so this attribute is written without the codebook checking it.',
  createHullLabel: 'Create a new grouping attribute',
};

export type ComposerNodeConfigurationSectionProps = Readonly<{
  copy?: Partial<ComposerNodeConfigurationCopy>;
}>;

/**
 * What the participant can do with nodes on this canvas.
 *
 * Four decisions the stage holds directly — `quickAdd`, `layoutVariable`,
 * `behaviours.automaticLayout` and `convexHullVariable` — and three of them
 * name an attribute the codebook has to have, so the section can create one
 * where the protocol has nothing suitable yet.
 *
 * The two attribute pickers deliberately exclude opposite things. Adding a node
 * collects a value through the codebook's own rules, so it may not take an
 * attribute something else writes around them. Grouping writes membership
 * straight onto the node as the participant lassoes and taps, so it may not
 * take an attribute a form elsewhere validates. Each rule is enforced twice:
 * the excluded attributes are not offered, and a pick that survives from a
 * stale draft is refused at save, with the reason.
 */
export default function ComposerNodeConfigurationSection({
  copy,
}: ComposerNodeConfigurationSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { committedFields } = useStageEditorForm();
  const setStageFieldValue = useSetStageFieldValue();
  const subject = useStageSubject();
  const waiting = subject === undefined;
  const roleMap = useVariableRoleMap();
  const variables = useSubjectVariables(subject);

  const liveQuickAdd = asText(useStageValue(QUICK_ADD_FIELD));
  const liveLayout = asText(useStageValue(LAYOUT_VARIABLE_FIELD));
  const liveHull = asText(useStageValue(CONVEX_HULL_FIELD));

  const quickAddOptions = useVariableOptions({
    subject,
    types: TEXT_TYPES,
    writerClass: 'validated',
    ...(liveQuickAdd === undefined ? {} : { currentValue: liveQuickAdd }),
  });
  const layoutOptions = useVariableOptions({
    subject,
    types: LAYOUT_TYPES,
    writerClass: 'unvalidated',
    ...(liveLayout === undefined ? {} : { currentValue: liveLayout }),
  });
  const hullOptions = useVariableOptions({
    subject,
    types: CATEGORICAL_TYPES,
    writerClass: 'unvalidated',
    ...(liveHull === undefined ? {} : { currentValue: liveHull }),
  });

  // The PRE-EDIT picks, so re-saving a stage that arrived holding a conflict is
  // never refused for one this edit did not introduce.
  const originalQuickAdd = asText(committedFields[QUICK_ADD_FIELD]) ?? '';
  const originalHull = asText(committedFields[CONVEX_HULL_FIELD]) ?? '';

  const quickAddValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          subject === undefined
            ? undefined
            : crossClassPickIssue({
                variableId: typeof value === 'string' ? value : '',
                originalVariableId: originalQuickAdd,
                hasConflictingUse: (variableId) =>
                  hasUnvalidatedUse(roleMap, subject, variableId),
                allVariables: variables,
                message: unvalidatedElsewhereMessage,
              }),
      ]),
    }),
    [originalQuickAdd, roleMap, subject, variables],
  );

  const hullValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          subject === undefined
            ? undefined
            : crossClassPickIssue({
                variableId: typeof value === 'string' ? value : '',
                originalVariableId: originalHull,
                hasConflictingUse: (variableId) =>
                  hasValidatedUse(roleMap, subject, variableId),
                allVariables: variables,
                message: validatedElsewhereMessage,
              }),
      ]),
    }),
    [originalHull, roleMap, subject, variables],
  );

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={waiting ? words.waitingDescription : words.description}
      disabled={waiting}
    >
      <ProtocolField<typeof VariablePickerControl>
        name={QUICK_ADD_FIELD}
        component={VariablePickerControl}
        label={words.quickAddLabel}
        hint={words.quickAddHint}
        options={quickAddOptions}
        emptyMessage="This type has no free-text attributes available, so there is nothing for the quick-add box to fill in."
        required
        {...quickAddValidation}
      />
      <CreateVariableAction
        subject={subject}
        variableType="text"
        label={words.createQuickAddLabel}
        description="Create a free-text attribute, and fill it in when a node is added"
        onCreated={(variableId) =>
          setStageFieldValue(QUICK_ADD_FIELD, variableId)
        }
      />

      <ProtocolField<typeof VariablePickerControl>
        name={LAYOUT_VARIABLE_FIELD}
        component={VariablePickerControl}
        label={words.layoutLabel}
        hint={words.layoutHint}
        options={layoutOptions}
        emptyMessage="This type has no position attributes yet. Create one to store where the participant puts each node."
        required
      />
      <CreateVariableAction
        subject={subject}
        variableType="layout"
        label={words.createLayoutLabel}
        description="Create an attribute to store node positions, and use it on this stage"
        onCreated={(variableId) =>
          setStageFieldValue(LAYOUT_VARIABLE_FIELD, variableId)
        }
      />

      <ProtocolField<typeof ToggleField>
        name={AUTOMATIC_LAYOUT_FIELD}
        component={ToggleField}
        label={words.automaticLayoutLabel}
        hint={words.automaticLayoutHint}
        inline
      />

      <ProtocolField<typeof VariablePickerControl>
        name={CONVEX_HULL_FIELD}
        component={VariablePickerControl}
        label={words.hullLabel}
        hint={words.hullHint}
        options={hullOptions}
        emptyMessage="This type has no attributes with a fixed set of values, so there is nothing to group nodes by."
        {...hullValidation}
      />
      <CreateVariableAction
        subject={subject}
        variableType="categorical"
        label={words.createHullLabel}
        description="Create an attribute with a fixed set of values, and group nodes by it"
        onCreated={(variableId) =>
          setStageFieldValue(CONVEX_HULL_FIELD, variableId)
        }
      />
    </BuilderSection>
  );
}
