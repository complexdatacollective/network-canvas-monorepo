import { CornerDownRight, X } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';

import type { ConditionDraft } from '../../localization/conditionText.ts';
import type { ConditionVersionMeta } from '../../localization/messageDocument.ts';
import { ConditionRulesControl } from '../../rules/ConditionRulesControl.tsx';
import { newConditionVersion } from './dynamicAttributeDraft.ts';
import { useDynamicTextEnvironment } from './editorEnvironment.ts';

const conditionVersionsMessages = defineMessages({
  rules: {
    id: 'protocolBuilder.conditionRows.rules',
    defaultMessage: 'Rules',
    description:
      'Heading of the rules of an “If” of a dynamic attribute or a logic block that has one “If” only.',
  },
  rulesForIf: {
    id: 'protocolBuilder.conditionRows.rulesForIf',
    defaultMessage: 'Rules for “If”',
    description:
      'Heading of the rules of the first “If” of a dynamic attribute or a logic block that also has one or more “Else if” rows.',
  },
  rulesForElseIf: {
    id: 'protocolBuilder.conditionRows.rulesForElseIf',
    defaultMessage: 'Rules for “Else if” {number}',
    description:
      'Heading of the rules of one “Else if” of a dynamic attribute or a logic block. number counts the “Else if” rows from 1.',
  },
  addElseIf: {
    id: 'protocolBuilder.dynamicText.addElseIf',
    defaultMessage: 'Add else if',
    description:
      'Button that adds an “Else if” to a dynamic attribute or a logic block: a version shown when the versions above it do not apply and new rules are met.',
  },
  removeRow: {
    id: 'protocolBuilder.dynamicText.removeIfRow',
    defaultMessage: 'Remove this case',
    description:
      'Button that removes one “Else if” (its rules and its version) from a dynamic attribute or a logic block.',
  },
});

/**
 * The heading of the rules of the condition version at `index` of `count`
 * condition versions.
 */
const versionRulesLabel = (
  intl: ReturnType<typeof useAppIntl>,
  index: number,
  count: number,
): string => {
  if (count === 1) return intl.formatMessage(conditionVersionsMessages.rules);
  return index === 0
    ? intl.formatMessage(conditionVersionsMessages.rulesForIf)
    : intl.formatMessage(conditionVersionsMessages.rulesForElseIf, {
        number: index,
      });
};

type ConditionVersionsProps = Readonly<{
  /** Unique among the controls on screen. */
  name: string;
  conditionVersions: readonly ConditionVersionMeta[];
  conditions: Readonly<Record<string, ConditionDraft>>;
  onChange: (
    conditionVersions: readonly ConditionVersionMeta[],
    conditions: Readonly<Record<string, ConditionDraft>>,
  ) => void;
  /** Each condition version's problem, by its condition id. */
  problems?: Readonly<Record<string, string>>;
  /** Whether the “Add else if” button is drawn here. */
  withAddElseIf?: boolean;
}>;

/**
 * The rules of each condition version of an “If” (the first condition version,
 * then each “Else if”), with a button to remove each “Else if”, and one to add
 * another.
 */
export function ConditionVersions({
  name,
  conditionVersions,
  conditions,
  onChange,
  problems = {},
  withAddElseIf = true,
}: ConditionVersionsProps) {
  const intl = useAppIntl();
  const environment = useDynamicTextEnvironment();
  const { scope } = environment.conditions;
  const readOnly = !environment.editable;
  return (
    <div className="flex flex-col gap-6">
      {conditionVersions.map((conditionVersion, index) => (
        <div
          key={conditionVersion.conditionId}
          data-condition-conditionVersion={conditionVersion.conditionId}
          className="flex flex-col gap-2"
        >
          <ConditionRulesControl
            name={`${name}-${conditionVersion.conditionId}`}
            label={versionRulesLabel(intl, index, conditionVersions.length)}
            condition={
              conditions[conditionVersion.conditionId] ?? { rules: [] }
            }
            onChange={(condition) =>
              onChange(conditionVersions, {
                ...conditions,
                [conditionVersion.conditionId]: condition,
              })
            }
            problem={problems[conditionVersion.conditionId]}
            readOnly={readOnly}
            {...scope}
          />
          {index > 0 && !readOnly && (
            <Button
              size="sm"
              variant="text"
              icon={<X aria-hidden />}
              className="self-start"
              onClick={() => {
                const { [conditionVersion.conditionId]: _removed, ...kept } =
                  conditions;
                onChange(
                  conditionVersions.filter(
                    (each) => each.conditionId !== conditionVersion.conditionId,
                  ),
                  kept,
                );
              }}
            >
              {intl.formatMessage(conditionVersionsMessages.removeRow)}
            </Button>
          )}
        </div>
      ))}
      {withAddElseIf && !readOnly && (
        <AddElseIfButton
          onAdd={() => {
            const added = newConditionVersion();
            onChange([...conditionVersions, added.conditionVersion], {
              ...conditions,
              [added.conditionVersion.conditionId]: added.condition,
            });
          }}
        />
      )}
    </div>
  );
}

export function AddElseIfButton({ onAdd }: Readonly<{ onAdd: () => void }>) {
  const intl = useAppIntl();
  return (
    <Button
      size="sm"
      variant="text"
      icon={<CornerDownRight aria-hidden className="rtl:-scale-x-100" />}
      className="self-start"
      onClick={onAdd}
    >
      {intl.formatMessage(conditionVersionsMessages.addElseIf)}
    </Button>
  );
}
