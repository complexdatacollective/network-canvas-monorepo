import { Trash2 } from 'lucide-react';
import { createElement, useId, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelect from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { NodeShape } from '@codaco/protocol-validation';

import VariablePickerField from '../../fields/VariablePickerField.tsx';
import {
  eligibleShapeVariables,
  isNodeShape,
  MAX_SHAPE_THRESHOLDS,
  mappingForVariable,
  nextThresholdValue,
  shapeForValue,
  shapeOptions,
  thresholdInputConfig,
  withDiscreteShape,
  withThresholds,
  type ShapeMappingDraft,
  type ShapeMappingOption,
  type ShapeMappingVariable,
  type ShapeThreshold,
} from '../shapeMapping.ts';

const messages = defineMessages({
  shapeMappingToggle: {
    id: 'protocolBuilder.codebookEntity.shapeMappingToggle',
    defaultMessage: 'Map attribute to shape',
    description:
      'Switch that turns on drawing a node as a different shape depending on one of its attributes. A node is a member of the interview network.',
  },
  shapeMappingDescription: {
    id: 'protocolBuilder.codebookEntity.shapeMappingDescription',
    defaultMessage:
      "Override the default shape based on the value of a node's attribute.",
    description:
      'Guidance under the shape mapping switch, saying what turning it on does. A node is a member of the interview network.',
  },
  shapeMappingAttribute: {
    id: 'protocolBuilder.codebookEntity.shapeMappingAttribute',
    defaultMessage: 'Attribute',
    description:
      'Label of the field choosing which of the type’s attributes the shape follows.',
  },
  shapeForEachValue: {
    id: 'protocolBuilder.codebookEntity.shapeForEachValue',
    defaultMessage: 'Shape for each value',
    description:
      'Heading over the rows that give one shape to each answer the chosen attribute can take.',
  },
  shapeForValue: {
    id: 'protocolBuilder.codebookEntity.shapeForValue',
    defaultMessage: 'Shape for {value1}',
    description:
      'Label of the control choosing the shape one answer is drawn as. value1 is the answer’s own label, already in the reader’s language where the protocol author wrote one.',
  },
  shapeValuesUnmapped: {
    id: 'protocolBuilder.codebookEntity.shapeValuesUnmapped',
    defaultMessage: 'Some values are unmapped and will use the default shape.',
    description:
      'Notice shown while at least one of the chosen attribute’s answers has been given no shape of its own.',
  },
  shapeThresholds: {
    id: 'protocolBuilder.codebookEntity.shapeThresholds',
    defaultMessage: 'Thresholds',
    description:
      'Heading over the rows that change the shape at a numeric value. A threshold is the value at which the shape changes.',
  },
  shapeBelowFirstThreshold: {
    id: 'protocolBuilder.codebookEntity.shapeBelowFirstThreshold',
    defaultMessage: 'Below first threshold',
    description:
      'Name of the fixed first row of the threshold list, covering every value under the lowest threshold.',
  },
  shapeDefaultSwatch: {
    id: 'protocolBuilder.codebookEntity.shapeDefaultSwatch',
    defaultMessage: 'Default shape',
    description:
      'Label of the read-only control on the fixed first threshold row, showing the shape chosen as this type’s default.',
  },
  shapeUsesDefault: {
    id: 'protocolBuilder.codebookEntity.shapeUsesDefault',
    defaultMessage: 'uses default shape',
    description:
      'Said on the fixed first threshold row, after the shape it shows. Lower case because it completes the row rather than beginning a sentence.',
  },
  shapeBelowFirstThresholdFixed: {
    id: 'protocolBuilder.codebookEntity.shapeBelowFirstThresholdFixed',
    defaultMessage: 'Below first threshold cannot be removed',
    description:
      'Accessible name of the unavailable remove button on the fixed first threshold row, saying why nothing happens.',
  },
  shapeThresholdValue: {
    id: 'protocolBuilder.codebookEntity.shapeThresholdValue',
    defaultMessage: 'Threshold {value1, number} value',
    description:
      'Label of the number field holding one threshold. value1 is the threshold’s own position in the list, counting from one, not the number the researcher typed.',
  },
  shapeAtThreshold: {
    id: 'protocolBuilder.codebookEntity.shapeAtThreshold',
    defaultMessage: 'Shape at threshold {value}',
    description:
      'Label of the control choosing the shape used from one threshold upwards. value is the threshold number itself, already formatted for the reader.',
  },
  shapeRemoveThreshold: {
    id: 'protocolBuilder.codebookEntity.shapeRemoveThreshold',
    defaultMessage: 'Remove threshold {value1, number}',
    description:
      'Accessible name of the button that deletes one threshold row. value1 is the threshold’s own position in the list, counting from one.',
  },
  shapeAddThreshold: {
    id: 'protocolBuilder.codebookEntity.shapeAddThreshold',
    defaultMessage: 'Add threshold',
    description: 'Button that adds one more threshold row to the list.',
  },
  shapeNoThresholds: {
    id: 'protocolBuilder.codebookEntity.shapeNoThresholds',
    defaultMessage: 'No thresholds yet — every value uses the default shape.',
    description:
      'Shown in place of the threshold list while no threshold has been set.',
  },
  shapeAnswerTrue: {
    id: 'protocolBuilder.codebookEntity.shapeAnswerTrue',
    defaultMessage: 'True',
    description:
      'Stands for the affirmative answer of a yes/no attribute that carries no labels of its own, in the list of answers a shape can be chosen for.',
  },
  shapeAnswerFalse: {
    id: 'protocolBuilder.codebookEntity.shapeAnswerFalse',
    defaultMessage: 'False',
    description:
      'Stands for the negative answer of a yes/no attribute that carries no labels of its own, in the list of answers a shape can be chosen for.',
  },
});

/**
 * The answers a discrete mapping offers a shape for.
 *
 * A yes/no attribute keeps its own labels where the protocol gives it some —
 * only the `Boolean` control carries them — and otherwise stands for its two
 * answers in this package's words, writing the raw booleans the interview
 * runtime compares against.
 */
const discreteOptions = (
  variable: ShapeMappingVariable,
  intl: IntlShape,
): readonly ShapeMappingOption[] => {
  if (variable.type === 'boolean') {
    return (
      variable.options ?? [
        { label: intl.formatMessage(messages.shapeAnswerTrue), value: true },
        { label: intl.formatMessage(messages.shapeAnswerFalse), value: false },
      ]
    );
  }
  return variable.options ?? [];
};

const parseThresholdValue = (value: string | undefined): number | undefined => {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const ROW_CLASSES =
  'bg-input text-input-contrast flex w-full items-center gap-4 rounded-lg px-4 py-3';

type ThresholdRowProps = Readonly<{
  threshold: ShapeThreshold;
  index: number;
  config: ReturnType<typeof thresholdInputConfig>;
  disabled: boolean;
  onUpdate(next: ShapeThreshold): void;
  onRemove(): void;
}>;

/**
 * One threshold: the value it starts at, and the shape used from there up.
 *
 * The number is held as a local string draft and committed on blur, because
 * every commit re-sorts the list: a value typed through — `0.`, or an empty box
 * on the way to a different number — would otherwise be rounded off or jumped
 * past a row down as the researcher typed it.
 */
function ThresholdRow({
  threshold,
  index,
  config,
  disabled,
  onUpdate,
  onRemove,
}: ThresholdRowProps) {
  const intl = useAppIntl();
  const [draft, setDraft] = useState(() => String(threshold.value));

  // A committed value arriving from above — a re-sort, a removal — replaces the
  // draft unless the draft already MEANS that number, so '0.' survives the
  // round trip. Compared during render: this is a change in a prop already
  // held, not something outside React to synchronise with.
  const [committed, setCommitted] = useState(threshold.value);
  if (committed !== threshold.value) {
    setCommitted(threshold.value);
    setDraft((current) =>
      parseThresholdValue(current) === threshold.value
        ? current
        : String(threshold.value),
    );
  }

  return (
    <div className={ROW_CLASSES}>
      {/* Mathematical comparison symbol, independent of locale. */}
      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
      <span className="text-xl text-current/70">≥</span>
      <div className="w-36 shrink-0">
        <UnconnectedField
          name={`shape-threshold-${index + 1}-value`}
          label={intl.formatMessage(messages.shapeThresholdValue, {
            value1: index + 1,
          })}
          labelHidden
          component={InputField}
          type="number"
          step={config.step}
          {...(config.min === undefined ? {} : { min: config.min })}
          {...(config.max === undefined ? {} : { max: config.max })}
          value={draft}
          disabled={disabled}
          onChange={(value) => setDraft(value ?? '')}
          onBlur={() => {
            const typed = parseThresholdValue(draft);
            // Nothing readable in the box, so there is nothing to commit —
            // and the box goes back to saying what is actually stored.
            // Architect left the old number saved under an empty box, which
            // is a researcher clearing a threshold to take it out, seeing it
            // gone, and getting it back in the interview.
            if (typed === undefined) {
              setDraft(String(threshold.value));
              return;
            }
            onUpdate({ value: typed, shape: threshold.shape });
          }}
        />
      </div>
      {/* Mathematical mapping symbol, independent of locale. */}
      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
      <span className="text-xl text-current/70">→</span>
      <div className="min-w-0 flex-1">
        <UnconnectedField
          name={`shape-threshold-${index + 1}-shape`}
          label={intl.formatMessage(messages.shapeAtThreshold, {
            value: intl.formatNumber(threshold.value, {
              maximumSignificantDigits: 21,
            }),
          })}
          labelHidden
          component={NativeSelect}
          options={shapeOptions(intl)}
          value={threshold.shape}
          disabled={disabled}
          onChange={(value) =>
            onUpdate({
              value: parseThresholdValue(draft) ?? threshold.value,
              shape: isNodeShape(value) ? value : threshold.shape,
            })
          }
        />
      </div>
      <IconButton
        icon={<Trash2 aria-hidden="true" />}
        color="destructive"
        variant="text"
        disabled={disabled}
        onClick={onRemove}
        aria-label={intl.formatMessage(messages.shapeRemoveThreshold, {
          value1: index + 1,
        })}
      />
    </div>
  );
}

/**
 * What tells one threshold row from another across a re-render.
 *
 * A threshold has no identity in the protocol, so it is identified by the
 * number it stands for — which the save requires to be unique, since the
 * thresholds must rise. Keyed by position instead, removing the first row
 * handed its React instance to what had been the second, and the second row's
 * half-typed number went with the instance that was discarded; a press on a
 * button moves no focus in Safari or Firefox on macOS, so on those the number
 * is still in the box rather than committed when the removal happens.
 *
 * A row whose own number changes gets a new key and starts again from it,
 * which is what the row's committed-value sync does for it anyway. Repeated
 * numbers — which the editor will not create and a hand-written protocol can
 * still arrive with — are told apart by how many have come before.
 */
const thresholdRowKeys = (
  thresholds: readonly Readonly<{ value: number }>[],
): readonly string[] => {
  const seen = new Map<number, number>();
  return thresholds.map(({ value }) => {
    const before = seen.get(value) ?? 0;
    seen.set(value, before + 1);
    return before === 0 ? String(value) : `${value}#${before}`;
  });
};

export type NodeShapeMappingFieldsProps = Readonly<{
  /** The type's own attributes, from the document the editor opened on. */
  variables: Readonly<Record<string, ShapeMappingVariable>>;
  /** The shape used wherever the mapping says nothing. */
  defaultShape?: NodeShape;
  /** The mapping as it stands; absent means the feature is switched off. */
  value?: ShapeMappingDraft;
  /** Absent clears `shape.dynamic` — see the toggle below. */
  onChange(next: ShapeMappingDraft | undefined): void;
  /** What is wrong with the mapping as a whole, encoded. */
  error?: string;
  disabled?: boolean;
}>;

/**
 * Draws a node type as a different shape depending on one of its attributes.
 *
 * The mapping is one value rather than a field per part: switching the feature
 * off has to REMOVE `shape.dynamic` from the saved type, and a mapping
 * assembled out of separate keys leaves whichever of them was last written
 * standing. Switching it back on starts from nothing for the same reason — a
 * mapping the researcher deliberately deleted must not reappear.
 */
export default function NodeShapeMappingFields({
  variables,
  defaultShape,
  value,
  onChange,
  error,
  disabled = false,
}: NodeShapeMappingFieldsProps) {
  const intl = useAppIntl();
  const errorId = useId();
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingHeadingLevel === null
      ? 'h4'
      : headingTagBelow(enclosingHeadingLevel);

  const enabled = value !== undefined;
  const mapping = value ?? {};
  const selectedId = mapping.variable;
  const selected = selectedId === undefined ? undefined : variables[selectedId];
  const config = thresholdInputConfig(selected);
  const options = eligibleShapeVariables(variables);
  const answers = selected === undefined ? [] : discreteOptions(selected, intl);
  const thresholds = mapping.thresholds ?? [];
  // Absent where the range is used up, and the control that would add one is
  // then not offered at all.
  const nextValue = nextThresholdValue(mapping, config);
  const thresholdKeys = thresholdRowKeys(thresholds);

  const groupHeading = (text: string) => (
    <Heading
      level="h4"
      margin="none"
      className="text-sm font-semibold text-current/70"
      {...(headingTag === 'h4' ? {} : { render: createElement(headingTag) })}
    >
      {text}
    </Heading>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between gap-4 font-semibold">
          <span>{intl.formatMessage(messages.shapeMappingToggle)}</span>
          <ToggleField
            aria-label={intl.formatMessage(messages.shapeMappingToggle)}
            value={enabled}
            disabled={disabled}
            onChange={(checked) => onChange(checked === true ? {} : undefined)}
          />
        </div>
        <Paragraph className="mt-1 mb-0! text-sm text-current/70">
          {intl.formatMessage(messages.shapeMappingDescription)}
        </Paragraph>
      </div>

      {enabled && (
        <div className="flex flex-col gap-4">
          <UnconnectedField
            name="shape-mapping-attribute"
            label={intl.formatMessage(messages.shapeMappingAttribute)}
            component={VariablePickerField}
            options={options}
            value={selectedId}
            disabled={disabled}
            onChange={(next) => {
              const variable = next === undefined ? undefined : variables[next];
              if (next === undefined || variable === undefined) return;
              onChange(mappingForVariable(next, variable));
            }}
          />

          {selected !== undefined && mapping.type === 'discrete' && (
            <div className="flex flex-col gap-3">
              {groupHeading(intl.formatMessage(messages.shapeForEachValue))}
              {answers.map((answer) => (
                <div key={JSON.stringify(answer.value)} className={ROW_CLASSES}>
                  <span className="min-w-0 flex-1 text-sm">{answer.label}</span>
                  <div className="w-48 shrink-0">
                    <UnconnectedField
                      name={`shape-for-${String(answer.value)}`}
                      label={intl.formatMessage(messages.shapeForValue, {
                        value1: answer.label,
                      })}
                      labelHidden
                      component={NativeSelect}
                      options={shapeOptions(intl)}
                      value={shapeForValue(mapping, answer.value) ?? ''}
                      disabled={disabled}
                      onChange={(next) => {
                        if (isNodeShape(next)) {
                          onChange(
                            withDiscreteShape(mapping, answer.value, next),
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
              {answers.some(
                (answer) => shapeForValue(mapping, answer.value) === undefined,
              ) && (
                <Paragraph className="text-warning mt-0 mb-0! text-xs">
                  {intl.formatMessage(messages.shapeValuesUnmapped)}
                </Paragraph>
              )}
            </div>
          )}

          {selected !== undefined && mapping.type === 'breakpoints' && (
            <div className="flex flex-col gap-3">
              {groupHeading(intl.formatMessage(messages.shapeThresholds))}
              {/* Everything under the lowest threshold, which is the type's
                  own default shape and not something to be chosen again. */}
              <div className={`${ROW_CLASSES} opacity-70`}>
                <span className="text-sm">
                  {intl.formatMessage(messages.shapeBelowFirstThreshold)}
                </span>
                {/* Mathematical mapping symbol, independent of locale. */}
                {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
                <span className="text-xl text-current/70">→</span>
                <div className="w-48 shrink-0">
                  <UnconnectedField
                    name="shape-below-first-threshold"
                    label={intl.formatMessage(messages.shapeDefaultSwatch)}
                    labelHidden
                    component={NativeSelect}
                    options={shapeOptions(intl)}
                    value={defaultShape ?? ''}
                    disabled
                    onChange={() => undefined}
                  />
                </div>
                <span className="ml-auto text-xs text-current/70">
                  {intl.formatMessage(messages.shapeUsesDefault)}
                </span>
                <IconButton
                  icon={<Trash2 aria-hidden="true" />}
                  color="destructive"
                  variant="text"
                  disabled
                  aria-label={intl.formatMessage(
                    messages.shapeBelowFirstThresholdFixed,
                  )}
                />
              </div>

              {thresholds.length === 0 && (
                <Paragraph className="mb-0! text-sm text-current/70">
                  {intl.formatMessage(messages.shapeNoThresholds)}
                </Paragraph>
              )}

              {thresholds.map((threshold, index) => (
                <ThresholdRow
                  key={thresholdKeys[index]}
                  threshold={threshold}
                  index={index}
                  config={config}
                  disabled={disabled}
                  onUpdate={(next) =>
                    onChange(
                      withThresholds(
                        mapping,
                        thresholds.map((current, position) =>
                          position === index ? next : current,
                        ),
                      ),
                    )
                  }
                  onRemove={() =>
                    onChange(
                      withThresholds(
                        mapping,
                        thresholds.filter((_, position) => position !== index),
                      ),
                    )
                  }
                />
              ))}

              {thresholds.length < MAX_SHAPE_THRESHOLDS &&
                nextValue !== undefined && (
                  <div>
                    <Button
                      type="button"
                      color="primary"
                      disabled={disabled}
                      onClick={() =>
                        onChange(
                          withThresholds(mapping, [
                            ...thresholds,
                            { value: nextValue, shape: 'square' },
                          ]),
                        )
                      }
                    >
                      {intl.formatMessage(messages.shapeAddThreshold)}
                    </Button>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      <FieldErrors
        id={errorId}
        name="shape-mapping"
        errors={error === undefined ? [] : [error]}
        show
        variant="box"
      />
    </div>
  );
}
