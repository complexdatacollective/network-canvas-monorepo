import { Trash2 } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  change,
  formValueSelector,
  getFormSyncErrors,
  hasSubmitFailed,
} from 'redux-form';

import { IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ArrayField, {
  type ArrayFieldItemProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';

import { ShapePickerControl, SHAPES } from './ShapePicker';
import type { EntityTypeFormErrors } from './validateEntityType';
const DISCRETE_TYPES = new Set(['categorical', 'ordinal', 'boolean']);
const BREAKPOINT_TYPES = new Set(['number', 'scalar']);
const ELIGIBLE_TYPES = new Set([...DISCRETE_TYPES, ...BREAKPOINT_TYPES]);
type Variable = {
  name: string;
  type: string;
  options?: Array<{
    label: string;
    value: string | number | boolean;
  }>;
  validation?: {
    minValue?: number;
    maxValue?: number;
  };
};
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
  variable: Variable | undefined,
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

type ThresholdData = {
  value: number;
  shape: string;
};

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
}: ArrayFieldItemProps<ThresholdData>) => {
  const { config, nodeColor } = useContext(ThresholdItemContext);
  const value = item.value ?? 0;
  const shape = item.shape ?? '';
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
          onUpdate({ value: parseThresholdValue(draft) ?? value, shape })
        }
      />
      <span className="text-muted text-xl">→</span>
      <ShapePickerControl
        small
        nodeColor={nodeColor}
        aria-label={`Shape at threshold ${value}`}
        value={shape}
        onChange={(nextShape) =>
          onUpdate({
            value: parseThresholdValue(draft) ?? value,
            shape: nextShape,
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

type ShapeVariableMappingProps = {
  form: string;
  nodeColor?: string;
};
const ShapeVariableMapping = ({
  form,
  nodeColor,
}: ShapeVariableMappingProps) => {
  const dispatch = useAppDispatch();
  const formSelector = useMemo(() => formValueSelector(form), [form]);
  const variables = useAppSelector((state: RootState) =>
    formSelector(state, 'variables'),
  ) as Record<string, Variable> | undefined;
  const dynamic = useAppSelector((state: RootState) =>
    formSelector(state, 'shape.dynamic'),
  ) as
    | {
        variable?: string;
        type?: string;
        map?: Array<{
          value: string | number | boolean;
          shape: string;
        }>;
        thresholds?: Array<{
          value: number;
          shape: string;
        }>;
      }
    | undefined;
  const defaultShape = useAppSelector((state: RootState) =>
    formSelector(state, 'shape.default'),
  ) as string | undefined;
  const enabled = !!dynamic;
  const eligibleVariables = useMemo(() => {
    if (!variables) return [];
    return Object.entries(variables)
      .filter(([, v]) => ELIGIBLE_TYPES.has(v.type))
      .map(([id, v]) => ({
        id,
        name: v.name,
        type: v.type,
        options: v.options,
      }));
  }, [variables]);
  const variableOptions = useMemo(() => {
    return eligibleVariables.map((v) => ({
      label: v.name,
      value: v.id,
      type: v.type,
    }));
  }, [eligibleVariables]);
  const selectedVarId = dynamic?.variable;
  const selectedVar =
    selectedVarId && variables ? variables[selectedVarId] : undefined;
  const thresholdConfig = getThresholdInputConfig(selectedVar);
  // Surface the type-editor's synchronous validation once a save has been
  // attempted, so a blocked submit explains itself rather than silently
  // no-op-ing. Before the first submit the guidance below stays out of the way.
  const submitFailed = useAppSelector((state: RootState) =>
    hasSubmitFailed(form)(state),
  );
  const dynamicErrors = useAppSelector((state: RootState) =>
    submitFailed
      ? (getFormSyncErrors(form)(state) as EntityTypeFormErrors | undefined)
          ?.shape?.dynamic
      : undefined,
  );
  // New thresholds seed one step above the current maximum (bounded by the
  // variable's range) so successive "Add threshold" clicks stay strictly
  // ascending instead of stacking duplicate zeros.
  const getNextThresholdValue = (): number => {
    const existing = dynamic?.thresholds ?? [];
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
  const handleToggle = () => {
    if (enabled) {
      dispatch(change(form, 'shape.dynamic', undefined));
    } else {
      dispatch(change(form, 'shape.dynamic', {}));
    }
  };
  const handleVariableChange = (varId: string) => {
    const variable = variables?.[varId];
    if (!variable) return;
    const mappingType = DISCRETE_TYPES.has(variable.type)
      ? 'discrete'
      : 'breakpoints';
    if (mappingType === 'discrete') {
      dispatch(
        change(form, 'shape.dynamic', {
          variable: varId,
          type: 'discrete',
          map: [],
        }),
      );
    } else {
      dispatch(
        change(form, 'shape.dynamic', {
          variable: varId,
          type: 'breakpoints',
          thresholds: [],
        }),
      );
    }
  };
  const handleDiscreteShapeChange = (
    value: string | number | boolean,
    shape: string,
  ) => {
    const currentMap = dynamic?.map ?? [];
    const existingIndex = currentMap.findIndex(
      (entry) => JSON.stringify(entry.value) === JSON.stringify(value),
    );
    let newMap: Array<{
      value: string | number | boolean;
      shape: string;
    }>;
    if (existingIndex >= 0) {
      newMap = currentMap.map((entry, i) =>
        i === existingIndex ? { ...entry, shape } : entry,
      );
    } else {
      newMap = [...currentMap, { value, shape }];
    }
    dispatch(change(form, 'shape.dynamic.map', newMap));
  };
  // The schema requires thresholds strictly ascending, so every mutation
  // re-sorts by value before it is stored. `toSorted` keeps the same item
  // references, so ArrayField's identity tracking follows items across the sort.
  const handleThresholdsChange = (next: ThresholdData[]) => {
    const sorted = [...next].toSorted((a, b) => a.value - b.value);
    dispatch(change(form, 'shape.dynamic.thresholds', sorted));
  };
  const getDiscreteOptions = (): Array<{
    label: string;
    value: string | number | boolean;
  }> => {
    if (!selectedVar) return [];
    if (selectedVar.type === 'boolean') {
      if (selectedVar.options) {
        return selectedVar.options;
      }
      return [
        { label: 'True', value: true },
        { label: 'False', value: false },
      ];
    }
    return selectedVar.options ?? [];
  };
  const getShapeForValue = (value: string | number | boolean): string => {
    const entry = dynamic?.map?.find(
      (m) => JSON.stringify(m.value) === JSON.stringify(value),
    );
    return entry?.shape ?? '';
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
          Override the default shape based on the value of a node's attribute.
        </Paragraph>
      </div>

      {enabled && (
        <div className="mt-5 flex flex-col">
          <UnconnectedField
            name="shape.dynamic.variable"
            label="Variable"
            component={VariablePickerControl}
            value={selectedVarId}
            onChange={handleVariableChange}
            options={variableOptions}
            disallowCreation
          />
          {dynamicErrors?.variable && (
            <Paragraph className="text-destructive mt-1 text-sm">
              {dynamicErrors.variable}
            </Paragraph>
          )}

          {selectedVar && dynamic?.type === 'discrete' && (
            <div className="flex flex-col gap-3">
              <Heading
                level="h4"
                margin="none"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                Shape for each value
              </Heading>
              {getDiscreteOptions().map((option) => {
                const currentShape = getShapeForValue(option.value);
                return (
                  <div key={String(option.value)} className={ITEM_ROW_CLASSES}>
                    <span className="flex-1 text-sm">{option.label}</span>
                    <ShapePickerControl
                      small
                      aria-label={`Shape for ${option.label}`}
                      value={currentShape}
                      onChange={(shape) =>
                        handleDiscreteShapeChange(option.value, shape)
                      }
                    />
                  </div>
                );
              })}
              {getDiscreteOptions().some(
                (opt) => !getShapeForValue(opt.value),
              ) && (
                <Paragraph className="text-warning mt-1 text-xs">
                  Some values are unmapped and will use the default shape.
                </Paragraph>
              )}
            </div>
          )}

          {selectedVar && dynamic?.type === 'breakpoints' && (
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
                value={{
                  config: thresholdConfig,
                  nodeColor,
                }}
              >
                <ArrayField<ThresholdData>
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
              {dynamicErrors?.thresholds && (
                <Paragraph className="text-destructive mt-1 text-sm">
                  {dynamicErrors.thresholds}
                </Paragraph>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default ShapeVariableMapping;
