import { Trash2 } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ArrayField, {
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Surface from '@codaco/fresco-ui/layout/Surface';
import type { NodeColorSequence } from '@codaco/fresco-ui/Node';
import OptionLabel, { optionLabelText } from '@codaco/fresco-ui/OptionLabel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { CustomShapes } from '@codaco/protocol-builder/codebook/customShapes';
import ShapePickerField from '@codaco/protocol-builder/fields/ShapePickerField';
import {
  type NodeShapeReference,
  NodeShapes,
  type Validation,
  type VariableOptions,
  type VariableType,
} from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import { getLocalization } from '~/selectors/protocol';
import { localizedText } from '~/utils/localizedText';

import type {
  DiscreteShapeMapEntry,
  ShapeMappingDraft,
  ShapeThreshold,
} from './shapeMappingTypes';
import { SHAPE_MAPPING_FIELD } from './validateEntityType';
const additionalMessages = defineMessages({
  addThreshold: {
    id: 'architect.additional.typeEditor.shapeVariableMapping.addThreshold',
    defaultMessage: 'Add threshold',
    description:
      "Button below the list of thresholds in the node type editor's shape mapping. Adds a threshold: a number at or above which nodes are drawn with a chosen shape.",
  },
  noThresholdsYetEveryValue: {
    id: 'architect.additional.typeEditor.shapeVariableMapping.noThresholdsYetEveryValue',
    defaultMessage: 'No thresholds yet — every value uses the default shape.',
    description:
      "Empty-state message in the thresholds list of the node type editor's shape mapping, shown before any threshold is added.",
  },
});
const messages = defineMessages({
  thresholdValue: {
    id: 'architect.typeEditor.shapeVariableMapping.thresholdValue',
    defaultMessage: 'Threshold {value1, number} value',
    description:
      'Accessible name of a numeric shape-mapping threshold input. value1 is the one-based threshold position, not the numeric breakpoint value.',
  },
  shapeAtThreshold: {
    id: 'architect.typeEditor.shapeVariableMapping.shapeAtThreshold',
    defaultMessage: 'Shape at threshold {value}',
    description:
      'Accessible label for the shape chosen at a numeric breakpoint. value is the complete locale-formatted threshold number; its precision must be preserved.',
  },
  removeThreshold: {
    id: 'architect.typeEditor.shapeVariableMapping.removeThreshold',
    defaultMessage: 'Remove threshold {value1, number}',
    description:
      'Accessible remove-button label for a shape-mapping threshold. value1 is its one-based position in the threshold list.',
  },
  true: {
    id: 'architect.typeEditor.shapeVariableMapping.true',
    defaultMessage: 'True',
    description:
      'Label of the True value of a yes/no variable in the shape mapping of the node type editor, beside the picker for the shape used when the variable is true.',
  },
  false: {
    id: 'architect.typeEditor.shapeVariableMapping.false',
    defaultMessage: 'False',
    description:
      'Label of the False value of a yes/no variable in the shape mapping of the node type editor, beside the picker for the shape used when the variable is false.',
  },
  attribute: {
    id: 'architect.typeEditor.shapeVariableMapping.attribute',
    defaultMessage: 'Attribute',
    description:
      "Label of the dropdown in the node type editor's shape mapping that chooses which variable of the node type decides the node's shape. Attribute means a codebook variable.",
  },
  shapeForEachValue: {
    id: 'architect.typeEditor.shapeVariableMapping.shapeForEachValue',
    defaultMessage: 'Shape for each value',
    description:
      "Heading above the list of a categorical, ordinal or yes/no variable's values in the shape mapping, each with a picker for the shape used for that value.",
  },
  shapeFor: {
    id: 'architect.typeEditor.shapeVariableMapping.shapeFor',
    defaultMessage: 'Shape for {value1}',
    description:
      "Accessible name of the shape picker beside one value of the variable in the shape mapping; read only by screen readers. value1 is the value's label.",
  },
  someValuesAreUnmappedAndWill: {
    id: 'architect.typeEditor.shapeVariableMapping.someValuesAreUnmappedAndWill',
    defaultMessage: 'Some values are unmapped and will use the default shape.',
    description:
      "Warning below the list of values in the shape mapping, shown while at least one value has no shape chosen. Those nodes use the node type's default shape.",
  },
  thresholds: {
    id: 'architect.typeEditor.shapeVariableMapping.thresholds',
    defaultMessage: 'Thresholds',
    description:
      'Heading and accessible name of the list of numeric thresholds in the shape mapping for a number or scale variable. Each threshold is a value at or above which nodes use a chosen shape.',
  },
  belowFirstThreshold: {
    id: 'architect.typeEditor.shapeVariableMapping.belowFirstThreshold',
    defaultMessage: 'Below first threshold',
    description:
      'Label of the fixed first row in the thresholds list of the shape mapping. It covers values lower than the lowest threshold, which use the default shape.',
  },
  defaultShape: {
    id: 'architect.typeEditor.shapeVariableMapping.defaultShape',
    defaultMessage: 'Default shape',
    description:
      "Accessible name of the disabled shape picker in the fixed Below first threshold row; it shows the node type's default shape. Read only by screen readers.",
  },
  usesDefaultShape: {
    id: 'architect.typeEditor.shapeVariableMapping.usesDefaultShape',
    defaultMessage: 'uses default shape',
    description:
      "Small note at the end of the fixed Below first threshold row, saying that values below the first threshold use the node type's default shape.",
  },
  belowFirstThresholdCannotBeRemoved: {
    id: 'architect.typeEditor.shapeVariableMapping.belowFirstThresholdCannotBeRemoved',
    defaultMessage: 'Below first threshold cannot be removed',
    description:
      'Accessible name of the disabled delete button in the fixed Below first threshold row; read only by screen readers. The row always exists and cannot be removed.',
  },
  mapAttributeToShape: {
    id: 'architect.typeEditor.shapeVariableMapping.mapAttributeToShape',
    defaultMessage: 'Map attribute to shape',
    description:
      'Label and accessible name of the on/off toggle in the node type editor that lets a variable of the node type decide the node shape instead of one default shape.',
  },
  overrideTheDefaultShapeBasedOn: {
    id: 'architect.typeEditor.shapeVariableMapping.overrideTheDefaultShapeBasedOn',
    defaultMessage:
      "Override the default shape based on the value of a node's attribute.",
    description:
      'Hint below the Map attribute to shape toggle. Attribute means a variable recorded about each node of this type.',
  },
  shapeMapping: {
    id: 'architect.typeEditor.shapeVariableMapping.shapeMapping',
    defaultMessage: 'Shape mapping',
    description:
      'Hidden field label (accessible name only) of the shape mapping editor, which holds the chosen variable and its value-to-shape rules.',
  },
});

const DISCRETE_TYPES = new Set<VariableType>([
  'categorical',
  'ordinal',
  'boolean',
]);
const BREAKPOINT_TYPES = new Set<VariableType>(['number', 'scalar']);
const ELIGIBLE_TYPES = new Set<VariableType>([
  ...DISCRETE_TYPES,
  ...BREAKPOINT_TYPES,
]);

export type ShapeMappingVariable = {
  name: string;
  type: VariableType;
  options?: VariableOptions;
  validation?: Pick<Validation, 'minValue' | 'maxValue'>;
};

/** Stable empty mapping: `initialValue` is a register-effect dependency. */
const EMPTY_MAPPING: ShapeMappingDraft = {};

const parseThresholdValue = (value: string | undefined): number | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

type ThresholdInputConfig = {
  min?: number;
  max?: number;
  step: number | 'any';
};

// Scalar variables are recorded on the Visual Analog Scale's normalised 0–1
// range, so their thresholds are fractions of 1 and the field must bound to
// [0, 1] and step in fractional increments rather than whole numbers. Number
// variables use whatever range their own validation defines.
const getThresholdInputConfig = (
  variable: ShapeMappingVariable | undefined,
): ThresholdInputConfig => {
  if (variable?.type === 'scalar') {
    return { min: 0, max: 1, step: 0.1 };
  }
  return {
    min: variable?.validation?.minValue,
    max: variable?.validation?.maxValue,
    step: 'any',
  };
};

// One shape band is reserved for the "below first threshold" default, so the
// remaining shapes cap how many thresholds can be distinguished.
const MAX_THRESHOLDS = NodeShapes.length - 1;

const ITEM_ROW_CLASSES =
  'bg-input text-input-contrast flex w-full min-h-20 items-center gap-3 rounded-lg px-4 py-2';

// The item component is a stable top-level component (so ArrayField never
// remounts rows); the per-variable input bounds and the node colour reach it
// through context rather than being closed over in the render.
type ThresholdItemContextValue = {
  config: ThresholdInputConfig;
  nodeColor?: NodeColorSequence;
  customShapes?: CustomShapes;
};

const ThresholdItemContext = createContext<ThresholdItemContextValue>({
  config: { step: 'any' },
});

// Always-editing ArrayField item for one threshold: a bounded number input
// (driven by a local string draft so in-progress values like '0.' survive) and
// an inline shape picker. The draft commits on blur; committing flows through
// the parent's onChange, which re-sorts the thresholds ascending.
const ThresholdItem = ({
  item,
  index,
  onUpdate,
  onDelete,
}: ArrayFieldItemProps<ShapeThreshold>) => {
  const intl = useAppIntl();
  const { config, nodeColor, customShapes } = useContext(ThresholdItemContext);
  const value = item.value ?? 0;
  const shape = item.shape;
  const [draft, setDraft] = useState(() => String(value));

  // A committed value arriving from the parent (a re-sort, an undo) replaces
  // the draft unless the draft already means that number — '0.' must survive
  // the round trip. Compared during render: this is a change in a prop we
  // already have, not something outside React to synchronise with.
  const [committedValue, setCommittedValue] = useState(value);
  if (committedValue !== value) {
    setCommittedValue(value);
    setDraft((current) =>
      parseThresholdValue(current) === value ? current : String(value),
    );
  }

  return (
    <>
      {/* Mathematical comparison symbol, independent of locale. */}
      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
      <span className="text-xl text-current/70">≥</span>
      <InputField
        type="number"
        step={config.step}
        min={config.min}
        max={config.max}
        size="sm"
        aria-label={intl.formatMessage(messages.thresholdValue, {
          value1: index + 1,
        })}
        className="w-36"
        value={draft}
        onChange={(nextValue) => setDraft(nextValue ?? '')}
        onBlur={() =>
          onUpdate?.({ value: parseThresholdValue(draft) ?? value, shape })
        }
      />
      {/* Mathematical mapping symbol, independent of locale. */}
      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
      <span className="text-xl text-current/70">→</span>
      <ShapePickerField
        small
        nodeColor={nodeColor}
        customShapes={customShapes}
        aria-label={intl.formatMessage(messages.shapeAtThreshold, {
          value: intl.formatNumber(value, { maximumSignificantDigits: 21 }),
        })}
        value={shape}
        onChange={(nextShape) =>
          onUpdate?.({
            value: parseThresholdValue(draft) ?? value,
            shape: nextShape ?? shape,
          })
        }
      />
      <IconButton
        icon={<Trash2 />}
        size="sm"
        color="destructive"
        variant="text"
        className="ms-auto"
        onClick={onDelete}
        aria-label={intl.formatMessage(messages.removeThreshold, {
          value1: index + 1,
        })}
      />
    </>
  );
};

type ShapeMappingEditorProps = CreateFormFieldProps<
  Record<string, unknown>,
  'div',
  {
    variables?: Record<string, ShapeMappingVariable>;
    nodeColor?: NodeColorSequence;
    defaultShape?: NodeShapeReference;
    customShapes?: CustomShapes;
  }
>;

/**
 * The shape mapping as ONE opaque field value. Nothing inside registers a
 * field of its own: a per-leaf registration would let a removed threshold's
 * dormant value reappear in `getFormValues()`, and the mapping is validated
 * (and reported) as a whole by `validateEntityType`.
 */
const ShapeMappingEditor = ({
  value,
  onChange,
  variables,
  nodeColor,
  defaultShape,
  customShapes,
}: ShapeMappingEditorProps) => {
  const intl = useAppIntl();
  const localization = useSelector(getLocalization);
  const dynamic = (value ?? EMPTY_MAPPING) as ShapeMappingDraft;

  const variableOptions = Object.entries(variables ?? {})
    .filter(([, variable]) => ELIGIBLE_TYPES.has(variable.type))
    .map(([id, variable]) => ({
      label: variable.name,
      value: id,
      type: variable.type,
    }));

  const selectedVarId = dynamic.variable;
  const selectedVar =
    selectedVarId && variables ? variables[selectedVarId] : undefined;
  const thresholdConfig = getThresholdInputConfig(selectedVar);

  const getNextThresholdValue = (): number => {
    const existing = dynamic.thresholds ?? [];
    const step =
      typeof thresholdConfig.step === 'number' ? thresholdConfig.step : 1;
    const base =
      existing.length > 0
        ? Math.max(...existing.map((threshold) => threshold.value)) + step
        : (thresholdConfig.min ?? 0);
    return thresholdConfig.max !== undefined
      ? Math.min(base, thresholdConfig.max)
      : base;
  };

  const handleVariableChange = (varId: string | undefined) => {
    const variable = varId ? variables?.[varId] : undefined;
    if (!varId || !variable) return;
    onChange?.(
      DISCRETE_TYPES.has(variable.type)
        ? { variable: varId, type: 'discrete', map: [] }
        : { variable: varId, type: 'breakpoints', thresholds: [] },
    );
  };

  const handleDiscreteShapeChange = (
    optionValue: DiscreteShapeMapEntry['value'],
    shape: NodeShapeReference,
  ) => {
    const currentMap = dynamic.map ?? [];
    const existingIndex = currentMap.findIndex(
      (entry) => JSON.stringify(entry.value) === JSON.stringify(optionValue),
    );
    const newMap =
      existingIndex >= 0
        ? currentMap.map((entry, index) =>
            index === existingIndex ? { ...entry, shape } : entry,
          )
        : [...currentMap, { value: optionValue, shape }];

    onChange?.({ ...dynamic, map: newMap });
  };

  // The schema requires thresholds strictly ascending, so every mutation
  // re-sorts by value before it is stored. `toSorted` keeps the same item
  // references, so ArrayField's identity tracking follows items across the sort.
  const handleThresholdsChange = (next: ShapeThreshold[]) => {
    onChange?.({
      ...dynamic,
      thresholds: next.toSorted((a, b) => a.value - b.value),
    });
  };

  const getDiscreteOptions = (): Array<{
    label: string;
    value: DiscreteShapeMapEntry['value'];
  }> => {
    if (!selectedVar) return [];
    if (selectedVar.type === 'boolean' && !selectedVar.options) {
      return [
        { label: intl.formatMessage(messages.true), value: true },
        { label: intl.formatMessage(messages.false), value: false },
      ];
    }
    return (selectedVar.options ?? []).map((option) => ({
      label: localizedText(option.label, localization),
      value: option.value,
    }));
  };

  const getShapeForValue = (
    optionValue: DiscreteShapeMapEntry['value'],
  ): NodeShapeReference | undefined =>
    dynamic.map?.find(
      (entry) => JSON.stringify(entry.value) === JSON.stringify(optionValue),
    )?.shape;

  return (
    <div className="flex flex-col">
      <UnconnectedField
        name={`${SHAPE_MAPPING_FIELD}.variable`}
        label={intl.formatMessage(messages.attribute)}
        component={VariablePickerControl}
        value={selectedVarId}
        onChange={handleVariableChange}
        options={variableOptions}
        disallowCreation
      />

      {selectedVar && dynamic.type === 'discrete' && (
        <div className="flex flex-col gap-3">
          <Heading
            level="h4"
            margin="none"
            className="mb-1 block text-sm font-semibold text-current/70"
          >
            {intl.formatMessage(messages.shapeForEachValue)}
          </Heading>
          {getDiscreteOptions().map((option) => (
            <div key={String(option.value)} className={ITEM_ROW_CLASSES}>
              <OptionLabel
                label={option.label}
                render={<span className="flex-1 text-sm" />}
              />
              <ShapePickerField
                small
                nodeColor={nodeColor}
                customShapes={customShapes}
                aria-label={intl.formatMessage(messages.shapeFor, {
                  value1: optionLabelText(option.label),
                })}
                value={getShapeForValue(option.value)}
                onChange={(shape) => {
                  if (shape) handleDiscreteShapeChange(option.value, shape);
                }}
              />
            </div>
          ))}
          {getDiscreteOptions().some((opt) => !getShapeForValue(opt.value)) && (
            <Paragraph className="text-warning mt-1 text-xs">
              {intl.formatMessage(messages.someValuesAreUnmappedAndWill)}
            </Paragraph>
          )}
        </div>
      )}

      {selectedVar && dynamic.type === 'breakpoints' && (
        <div className="flex flex-col gap-3">
          <Heading level="h4" margin="none" className="mb-1 block text-sm">
            {intl.formatMessage(messages.thresholds)}
          </Heading>
          <Surface
            noContainer
            spacing="sm"
            aria-disabled="true"
            className={`${ITEM_ROW_CLASSES} pointer-events-none rounded-sm select-none`}
          >
            <span className="text-sm">
              {intl.formatMessage(messages.belowFirstThreshold)}
            </span>
            {/* Mathematical mapping symbol, independent of locale. */}
            {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
            <span className="text-xl text-current/70">→</span>
            <ShapePickerField
              small
              disabled
              readOnly
              nodeColor={nodeColor}
              customShapes={customShapes}
              value={defaultShape}
              aria-label={intl.formatMessage(messages.defaultShape)}
            />
            <span className="ms-auto text-xs text-current/70">
              {intl.formatMessage(messages.usesDefaultShape)}
            </span>
            <IconButton
              icon={<Trash2 />}
              size="sm"
              color="destructive"
              variant="text"
              disabled
              aria-label={intl.formatMessage(
                messages.belowFirstThresholdCannotBeRemoved,
              )}
            />
          </Surface>
          <ThresholdItemContext.Provider
            value={{ config: thresholdConfig, nodeColor, customShapes }}
          >
            <ArrayField<ShapeThreshold>
              aria-label={intl.formatMessage(messages.thresholds)}
              className="w-full gap-3 border-0 bg-transparent p-0"
              sortable={false}
              immediateAdd
              confirmDelete={false}
              maxItems={MAX_THRESHOLDS}
              value={dynamic.thresholds ?? []}
              onChange={(next) => handleThresholdsChange(next ?? [])}
              itemComponent={ThresholdItem}
              itemTemplate={() => ({
                value: getNextThresholdValue(),
                shape: 'square',
              })}
              addButtonLabel={intl.formatMessage(
                additionalMessages.addThreshold,
              )}
              emptyStateMessage={intl.formatMessage(
                additionalMessages.noThresholdsYetEveryValue,
              )}
              itemClasses={ITEM_ROW_CLASSES}
            />
          </ThresholdItemContext.Provider>
        </div>
      )}
    </div>
  );
};

type ShapeVariableMappingProps = {
  /**
   * The type's codebook variables, from the dialog's committed values. They
   * are not edited here, so they are read from the caller rather than the form.
   */
  variables?: Record<string, ShapeMappingVariable>;
  /** The committed mapping, seeding the field when one is already configured. */
  initialMapping?: ShapeMappingDraft;
  nodeColor?: NodeColorSequence;
  defaultShape?: NodeShapeReference;
  customShapes?: CustomShapes;
};

/**
 * Optional override of a node type's default shape, driven by one of its
 * variables. The mapping is a single field so that turning the feature off
 * genuinely removes `shape.dynamic` from the saved type: `getFormValues()`
 * reports registered fields only, and the value is cleared explicitly rather
 * than left dormant.
 */
const ShapeVariableMapping = ({
  variables,
  initialMapping,
  nodeColor,
  defaultShape,
  customShapes,
}: ShapeVariableMappingProps) => {
  const intl = useAppIntl();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const [enabled, setEnabled] = useState(Boolean(initialMapping));

  const handleToggle = (checked: boolean | undefined) => {
    // Write on BOTH edges. The field is unmounted either way, so whatever it
    // held is parked dormant, and `registerField` prefers a dormant value over
    // `initialValue` — turning the feature off therefore has to CLEAR the value
    // (or the mapping would come back the next time it is switched on), and
    // turning it on has to stage the empty mapping itself (or the `undefined`
    // parked by the previous off survives, `getFormValues()` reports no
    // `shape.dynamic` at all, and the form-level completeness check — which
    // rightly ignores a type with no mapping — never runs on a toggle that
    // reads ON).
    //
    // The empty mapping, never `initialMapping`: re-enabling must not resurrect
    // a mapping the author deliberately deleted by switching the feature off.
    setFieldValue(SHAPE_MAPPING_FIELD, checked ? EMPTY_MAPPING : undefined);
    setEnabled(Boolean(checked));
  };

  return (
    <div className="mb-8">
      <div className="py-2.5">
        <div className="flex items-center justify-between font-semibold">
          <span>{intl.formatMessage(messages.mapAttributeToShape)}</span>
          <ToggleField
            aria-label={intl.formatMessage(messages.mapAttributeToShape)}
            value={enabled}
            onChange={handleToggle}
          />
        </div>
        <Paragraph intent="smallText" emphasis="muted" className="mt-1">
          {intl.formatMessage(messages.overrideTheDefaultShapeBasedOn)}
        </Paragraph>
      </div>

      {enabled && (
        <div className="mt-5">
          <ArchitectField
            name={SHAPE_MAPPING_FIELD}
            label={intl.formatMessage(messages.shapeMapping)}
            labelHidden
            component={ShapeMappingEditor}
            initialValue={initialMapping ?? EMPTY_MAPPING}
            variables={variables}
            nodeColor={nodeColor}
            defaultShape={defaultShape}
            customShapes={customShapes}
            // Completeness is judged for the mapping as a whole by the
            // dialog's form-level `validateEntityType`, which reports at this
            // same field name.
            validation={{}}
          />
        </div>
      )}
    </div>
  );
};

export default ShapeVariableMapping;
