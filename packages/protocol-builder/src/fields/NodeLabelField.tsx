import { Plus, Trash2 } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type Codebook,
  DYNAMIC_VALUE_NAME,
  type DynamicValues,
  type LocalizedString,
  nodeLabelValueContext,
  parseDynamicValuePath,
} from '@codaco/protocol-validation';

import { dynamicValueNamesUsedIn } from '../localization/dynamicValueCatalog.ts';
import { LocalizedStringField } from '../localization/LocalizedStringControl.tsx';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import { usableBindings } from '../localization/useDynamicValueSite.ts';
import { RuleCodebookProvider } from '../rules/ruleCodebookSource.ts';
import type { RuleSetValue } from '../rules/ruleSet.ts';
import { DynamicMessageEditor } from './DynamicTextField.tsx';
import { ConditionRuleSetField } from './RuleSetField.tsx';

const messages = defineMessages({
  textPlaceholder: {
    id: 'protocolBuilder.nodeLabel.textPlaceholder',
    defaultMessage:
      'Write the label, and insert values with the syringe button…',
    description:
      'Placeholder inside the text field where a researcher writes the label shown on every node of a node type. The syringe button is the toolbar button that inserts a value, such as one of the node’s attributes.',
  },
  conditionsHeading: {
    id: 'protocolBuilder.nodeLabel.conditionsHeading',
    defaultMessage: 'Conditions',
    description:
      'Heading above the list of conditions of a node type’s own label. A condition is a named set of rules a node either meets or does not; the label can show different text on nodes that meet it.',
  },
  conditionsDescription: {
    id: 'protocolBuilder.nodeLabel.conditionsDescription',
    defaultMessage:
      'A condition is a set of rules that a node either meets or does not, such as “age is greater than 65” or “has a Friends edge”. Once you have added a condition, insert it into the label from the syringe menu to show different text on nodes that meet it.',
    description:
      'Explanation under the Conditions heading of a node type’s own label. The syringe menu is the menu the label field’s syringe toolbar button opens, listing the values that can be inserted. Friends is an example edge type name.',
  },
  conditionsNeedSavedType: {
    id: 'protocolBuilder.nodeLabel.conditionsNeedSavedType',
    defaultMessage:
      'Save this node type before adding conditions. A condition’s rules are about the node type’s attributes, which it does not have yet.',
    description:
      'Note shown in place of the list of conditions while a new node type is being created and has not been saved yet.',
  },
  conditionName: {
    id: 'protocolBuilder.nodeLabel.conditionName',
    defaultMessage: 'Condition name',
    description:
      'Label of the field naming one condition of a node type’s own label. The name is what the condition is called in the label field’s insert menu; participants never see it.',
  },
  conditionNameHint: {
    id: 'protocolBuilder.nodeLabel.conditionNameHint',
    defaultMessage:
      'Shown in the label’s syringe menu. Participants never see it.',
    description:
      'Hint under the Condition name field. The syringe menu is the menu the label field’s syringe toolbar button opens.',
  },
  conditionRules: {
    id: 'protocolBuilder.nodeLabel.conditionRules',
    defaultMessage: 'Rules',
    description:
      'Label of the rule builder of one condition of a node type’s own label, where the researcher adds the rules a node must meet.',
  },
  conditionRulesHint: {
    id: 'protocolBuilder.nodeLabel.conditionRulesHint',
    defaultMessage:
      'Each rule is asked of the node the label is on: a node rule about one of its attributes, an edge rule about the edges that connect it to other nodes.',
    description:
      'Hint under the rule builder of one condition of a node type’s own label.',
  },
  newConditionName: {
    id: 'protocolBuilder.nodeLabel.newConditionName',
    defaultMessage: 'Condition {number, number}',
    description:
      'Name given to a newly added condition of a node type’s own label until the researcher renames it. number counts the conditions, starting at 1.',
  },
  addCondition: {
    id: 'protocolBuilder.nodeLabel.addCondition',
    defaultMessage: 'Add condition',
    description: 'Button that adds a new condition to a node type’s own label.',
  },
  removeCondition: {
    id: 'protocolBuilder.nodeLabel.removeCondition',
    defaultMessage: 'Remove condition',
    description:
      'Button that removes one condition from a node type’s own label.',
  },
  removeNamedCondition: {
    id: 'protocolBuilder.nodeLabel.removeNamedCondition',
    defaultMessage: 'Remove condition “{name}”',
    description:
      'Accessible name of the button that removes one condition from a node type’s own label. name is the condition’s name as the researcher wrote it.',
  },
  conditionInUse: {
    id: 'protocolBuilder.nodeLabel.conditionInUse',
    defaultMessage:
      'The label uses this condition. Remove it from the label before removing the condition.',
    description:
      'Note under a condition of a node type’s own label that cannot be removed because the label’s text chooses its wording by it.',
  },
});

/** One condition as the field holds it while it is being written. */
export type NodeLabelConditionDraft = Readonly<{
  name?: string;
  filter?: RuleSetValue;
}>;

/**
 * A node type's own label as the field holds it while it is being written:
 * the schema's `NodeLabel`, any part of which may still be missing.
 */
export type NodeLabelDraft = Readonly<{
  text?: LocalizedString;
  dynamicValues?: DynamicValues;
  conditions?: Readonly<Record<string, NodeLabelConditionDraft>>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asDraft = (value: unknown): NodeLabelDraft =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field's own value, which only this field writes; each part is read defensively where it is used
  isRecord(value) ? (value as NodeLabelDraft) : {};

/** `draft` without the parts that hold nothing, as the schema stores it. */
const withoutEmptyParts = (draft: NodeLabelDraft): NodeLabelDraft => ({
  ...(draft.text !== undefined &&
    Object.keys(draft.text).length > 0 && { text: draft.text }),
  ...(draft.dynamicValues !== undefined &&
    Object.keys(draft.dynamicValues).length > 0 && {
      dynamicValues: draft.dynamicValues,
    }),
  ...(draft.conditions !== undefined &&
    Object.keys(draft.conditions).length > 0 && {
      conditions: draft.conditions,
    }),
});

/** Words of `name` as a condition id: ASCII letters and digits, camel-cased. */
const conditionIdFrom = (name: string, taken: ReadonlySet<string>): string => {
  const words = name
    .normalize('NFKD')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '');
  const joined = words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
  const base = DYNAMIC_VALUE_NAME.test(joined) ? joined : 'condition';
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
};

export type NodeLabelFieldProps = CreateFormFieldProps<
  NodeLabelDraft,
  'div',
  {
    /** The protocol's codebook, as it is stored. */
    codebook: Readonly<Codebook> | undefined;
    /**
     * The id of the node type the label belongs to; undefined while a new
     * type is being created, which has no attributes for a rule to name.
     */
    nodeType: string | undefined;
  }
>;

/**
 * How a node type labels its nodes: one line of text a participant reads on
 * every node of the type, which shows values as a stage's text does (the
 * same editor, with the syringe menu). What it can show is about the node
 * the label is on: its attributes, the label the interview would otherwise
 * have chosen for it, how it is connected, and the conditions listed beneath
 * the text, each a set of rules built with the rule builder that filters and
 * skip logic use. Text can give a version for each case of any of these, and
 * a version can hold further versions.
 *
 * The whole label is one value of the surrounding form, as a rule set is:
 * the text binds the values it shows as it is written, and a binding no
 * translation names any more is dropped.
 */
export default function NodeLabelField({
  id,
  name,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  codebook,
  nodeType,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: NodeLabelFieldProps) {
  const intl = useAppIntl();
  const conditionsHeadingId = useId();
  const { localization, locale } = useEditingLanguage();
  const draft = useMemo(() => asDraft(value), [value]);

  // The text's editor writes the text and then the bindings it uses, one
  // after the other, before this field is drawn again: each write builds on
  // the one before it rather than on the value this render was given.
  const pending = useRef<NodeLabelDraft | null>(null);
  useLayoutEffect(() => {
    pending.current = null;
  });
  const write = (patch: Partial<NodeLabelDraft>) => {
    const next = withoutEmptyParts({ ...(pending.current ?? draft), ...patch });
    pending.current = next;
    onChange?.(next);
  };

  const conditions = draft.conditions ?? {};
  const context = useMemo(
    () =>
      nodeLabelValueContext({
        codebook,
        nodeType: nodeType ?? '',
        conditions: draft.conditions,
      }),
    [codebook, nodeType, draft.conditions],
  );
  const bindings = useMemo(
    () => usableBindings(draft.dynamicValues),
    [draft.dynamicValues],
  );

  // A condition's rules are about this node type alone among the nodes, so
  // its rule editor is given a codebook that holds no other.
  const ruleCodebook = useMemo((): Readonly<Codebook> => {
    const definition =
      nodeType === undefined ? undefined : codebook?.node?.[nodeType];
    return {
      ...(definition !== undefined &&
        nodeType !== undefined && { node: { [nodeType]: definition } }),
      ...(codebook?.edge !== undefined && { edge: codebook.edge }),
    };
  }, [codebook, nodeType]);

  const conditionsInUse = new Set(
    Object.values(bindings).flatMap((binding) => {
      const parsed = parseDynamicValuePath(binding.path);
      return parsed?.kind === 'condition' ? [parsed.conditionId] : [];
    }),
  );

  const writeCondition = (
    conditionId: string,
    patch: Partial<NodeLabelConditionDraft>,
  ) =>
    write({
      conditions: {
        ...conditions,
        [conditionId]: { ...conditions[conditionId], ...patch },
      },
    });

  const addCondition = () => {
    const conditionName = intl.formatMessage(messages.newConditionName, {
      number: Object.keys(conditions).length + 1,
    });
    const conditionId = conditionIdFrom(
      conditionName,
      new Set([...Object.keys(conditions), ...Object.keys(bindings)]),
    );
    write({
      conditions: { ...conditions, [conditionId]: { name: conditionName } },
    });
  };

  const removeCondition = (conditionId: string) =>
    write({
      conditions: Object.fromEntries(
        Object.entries(conditions).filter(([each]) => each !== conditionId),
      ),
    });

  const locked = disabled || readOnly;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <LocalizedStringField
        value={draft.text}
        onChange={(text) => write({ text })}
      >
        {(translation) => (
          <DynamicMessageEditor
            id={id ?? name ?? 'node-label'}
            name={name ?? 'dynamicLabel'}
            ariaDescribedBy={ariaDescribedBy ?? ''}
            ariaLabelledBy={ariaLabelledBy}
            ariaInvalid={ariaInvalid === true}
            ariaRequired={ariaRequired === true}
            placeholder={intl.formatMessage(messages.textPlaceholder)}
            disabled={disabled}
            readOnly={readOnly || translation.readOnly}
            markdown={false}
            singleLine
            message={translation.message}
            onMessageChange={translation.onMessageChange}
            locale={locale ?? localization?.defaultLocale ?? 'en'}
            site={{
              context,
              bindings,
              setBindings: (next) => write({ dynamicValues: next }),
              namesInUse: () =>
                dynamicValueNamesUsedIn((pending.current ?? draft).text),
            }}
          />
        )}
      </LocalizedStringField>

      <section
        aria-labelledby={conditionsHeadingId}
        className="flex min-w-0 flex-col gap-4"
      >
        <div>
          <Heading level="h4" margin="none" id={conditionsHeadingId}>
            {intl.formatMessage(messages.conditionsHeading)}
          </Heading>
          <Paragraph margin="none">
            {intl.formatMessage(messages.conditionsDescription)}
          </Paragraph>
        </div>

        {nodeType === undefined ? (
          <Alert variant="info" density="compact">
            {intl.formatMessage(messages.conditionsNeedSavedType)}
          </Alert>
        ) : (
          <>
            {Object.entries(conditions).map(([conditionId, condition]) => {
              const inUse = conditionsInUse.has(conditionId);
              return (
                <Surface
                  key={conditionId}
                  spacing="sm"
                  shadow="sm"
                  noContainer
                  data-condition={conditionId}
                  className="flex min-w-0 flex-col gap-6"
                >
                  <UnconnectedField
                    name={`${name ?? 'dynamicLabel'}.conditions.${conditionId}.name`}
                    component={InputField}
                    label={intl.formatMessage(messages.conditionName)}
                    hint={intl.formatMessage(messages.conditionNameHint)}
                    value={condition.name ?? ''}
                    disabled={disabled}
                    readOnly={readOnly}
                    onChange={(next) =>
                      writeCondition(conditionId, {
                        name: typeof next === 'string' ? next : '',
                      })
                    }
                  />
                  <RuleCodebookProvider value={ruleCodebook}>
                    <UnconnectedField
                      name={`${name ?? 'dynamicLabel'}.conditions.${conditionId}.filter`}
                      component={ConditionRuleSetField}
                      label={intl.formatMessage(messages.conditionRules)}
                      hint={intl.formatMessage(messages.conditionRulesHint)}
                      value={condition.filter}
                      disabled={disabled}
                      readOnly={readOnly}
                      onChange={(next) =>
                        writeCondition(conditionId, {
                          filter: isRecord(next) ? next : undefined,
                        })
                      }
                    />
                  </RuleCodebookProvider>
                  <div className="flex flex-col items-start gap-2">
                    <Button
                      type="button"
                      variant="text"
                      color="destructive"
                      size="sm"
                      icon={<Trash2 aria-hidden />}
                      disabled={locked || inUse}
                      aria-label={intl.formatMessage(
                        messages.removeNamedCondition,
                        { name: condition.name ?? conditionId },
                      )}
                      onClick={() => removeCondition(conditionId)}
                    >
                      {intl.formatMessage(messages.removeCondition)}
                    </Button>
                    {inUse && (
                      <Paragraph margin="none" className="text-sm">
                        {intl.formatMessage(messages.conditionInUse)}
                      </Paragraph>
                    )}
                  </div>
                </Surface>
              );
            })}
            <div>
              <Button
                type="button"
                icon={<Plus aria-hidden />}
                disabled={locked}
                onClick={addCondition}
              >
                {intl.formatMessage(messages.addCondition)}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
