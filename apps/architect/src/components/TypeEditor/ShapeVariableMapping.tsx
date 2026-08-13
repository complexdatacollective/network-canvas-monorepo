import { Trash2 } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';

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
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type {
  NodeShape,
  Validation,
  VariableOptions,
  VariableType,
} from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';

import type {
  DiscreteShapeMapEntry,
  ShapeMappingDraft,
  ShapeThreshold,
} from './shapeMappingTypes';
import { ShapePickerControl, SHAPES } from './ShapePicker';
import { SHAPE_MAPPING_FIELD } from './validateEntityType';

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
const MAX_THRESHOLDS = SHAPES.length - 1;

const ITEM_ROW_CLASSES =
  'bg-input text-input-contrast flex w-full min-h-20 items-center gap-3 rounded-lg px-4';

// The item component is a stable top-level component (so ArrayField never
// remounts rows); the per-variable input bounds and the node colour reach it
// through context rather than being closed over in the render.
type ThresholdItemContextValue = {
  config: ThresholdInputConfig;
  nodeColor?: string;
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
  const { config, nodeColor } = useContext(ThresholdItemContext);
  const value = item.value ?? 0;
  const shape = item.shape;
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    setDraft((current) =>
      parseThresholdValue(current) === value ? current : String(value),
    );
  }, [value]);

  return (
    <>
      <span className="text-muted text-xl">≥</span>
      <InputField
        type="number"
        step={config.step}
        min={config.min}
        max={config.max}
        size="sm"
        aria-label={`Threshold ${index + 1} value`}
        className="w-36"
        value={draft}
        onChange={(nextValue) => setDraft(nextValue ?? '')}
        onBlur={() =>
          onUpdate?.({ value: parseThresholdValue(draft) ?? value, shape })
        }
      />
      <span className="text-muted text-xl">→</span>
      <ShapePickerControl
        small
        nodeColor={nodeColor}
        aria-label={`Shape at threshold ${value}`}
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
        className="ml-auto"
        onClick={onDelete}
        aria-label={`Remove threshold ${index + 1}`}
      />
    </>
  );
};

type ShapeMappingEditorProps = CreateFormFieldProps<
  Record<string, unknown>,
  'div',
  {
    variables?: Record<string, ShapeMappingVariable>;
    nodeColor?: string;
    defaultShape?: NodeShape;
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
}: ShapeMappingEditorProps) => {
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
    shape: NodeShape,
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
    if (selectedVar.type === 'boolean') {
      return (
        selectedVar.options ?? [
          { label: 'True', value: true },
          { label: 'False', value: false },
        ]
      );
    }
    return selectedVar.options ?? [];
  };

  const getShapeForValue = (
    optionValue: DiscreteShapeMapEntry['value'],
  ): NodeShape | undefined =>
    dynamic.map?.find(
      (entry) => JSON.stringify(entry.value) === JSON.stringify(optionValue),
    )?.shape;

  return (
    <div className="flex flex-col">
      <UnconnectedField
        name={`${SHAPE_MAPPING_FIELD}.variable`}
        label="Variable"
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
            className="text-muted mb-1 block text-sm font-semibold"
          >
            Shape for each value
          </Heading>
          {getDiscreteOptions().map((option) => (
            <div key={String(option.value)} className={ITEM_ROW_CLASSES}>
              <span className="flex-1 text-sm">{option.label}</span>
              <ShapePickerControl
                small
                nodeColor={nodeColor}
                aria-label={`Shape for ${option.label}`}
                value={getShapeForValue(option.value)}
                onChange={(shape) => {
                  if (shape) handleDiscreteShapeChange(option.value, shape);
                }}
              />
            </div>
          ))}
          {getDiscreteOptions().some((opt) => !getShapeForValue(opt.value)) && (
            <Paragraph className="text-warning mt-1 text-xs">
              Some values are unmapped and will use the default shape.
            </Paragraph>
          )}
        </div>
      )}

      {selectedVar && dynamic.type === 'breakpoints' && (
        <div className="flex flex-col gap-3">
          <Heading level="h4" margin="none" className="mb-1 block text-sm">
            Thresholds
          </Heading>
          <Surface
            noContainer
            spacing="sm"
            aria-disabled="true"
            className={`${ITEM_ROW_CLASSES} pointer-events-none select-none`}
            style={{ borderRadius: 14 }}
          >
            <span className="text-sm">Below first threshold</span>
            <span className="text-muted text-xl">→</span>
            <ShapePickerControl
              small
              disabled
              readOnly
              nodeColor={nodeColor}
              value={defaultShape}
              aria-label="Default shape"
            />
            <span className="text-muted ml-auto text-xs">
              uses default shape
            </span>
            <IconButton
              icon={<Trash2 />}
              size="sm"
              color="destructive"
              variant="text"
              disabled
              aria-label="Below first threshold cannot be removed"
            />
          </Surface>
          <ThresholdItemContext.Provider
            value={{ config: thresholdConfig, nodeColor }}
          >
            <ArrayField<ShapeThreshold>
              aria-label="Thresholds"
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
              addButtonLabel="Add threshold"
              emptyStateMessage="No thresholds yet — every value uses the default shape."
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
  nodeColor?: string;
  defaultShape?: NodeShape;
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
}: ShapeVariableMappingProps) => {
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
    <div className="mt-5">
      <div className="border-surface-2 border-t py-2.5">
        <div className="flex items-center justify-between font-semibold">
          <span>Map variable to shape</span>
          <ToggleField
            aria-label="Map variable to shape"
            value={enabled}
            onChange={handleToggle}
          />
        </div>
        <Paragraph className="text-muted mt-1 text-sm">
          Override the default shape based on the value of a node&apos;s
          attribute.
        </Paragraph>
      </div>

      {enabled && (
        <div className="mt-5">
          <ArchitectField
            name={SHAPE_MAPPING_FIELD}
            label="Shape mapping"
            labelHidden
            component={ShapeMappingEditor}
            initialValue={initialMapping ?? EMPTY_MAPPING}
            variables={variables}
            nodeColor={nodeColor}
            defaultShape={defaultShape}
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
