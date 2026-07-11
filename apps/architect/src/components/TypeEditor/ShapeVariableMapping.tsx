import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { change, formValueSelector } from 'redux-form';

import Button, { IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';

import { ShapePickerControl } from './ShapePicker';
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
  const handleThresholdValueChange = (index: number, value: number) => {
    const currentThresholds = dynamic?.thresholds ?? [];
    const newThresholds = currentThresholds.map((t, i) =>
      i === index ? { ...t, value } : t,
    );
    dispatch(change(form, 'shape.dynamic.thresholds', newThresholds));
  };
  const handleThresholdShapeChange = (index: number, shape: string) => {
    const currentThresholds = dynamic?.thresholds ?? [];
    const newThresholds = currentThresholds.map((t, i) =>
      i === index ? { ...t, shape } : t,
    );
    dispatch(change(form, 'shape.dynamic.thresholds', newThresholds));
  };
  const handleAddThreshold = () => {
    const currentThresholds = dynamic?.thresholds ?? [];
    if (currentThresholds.length >= 2) return;
    const newThresholds = [...currentThresholds, { value: 0, shape: 'square' }];
    dispatch(change(form, 'shape.dynamic.thresholds', newThresholds));
  };
  const handleRemoveThreshold = (index: number) => {
    const currentThresholds = dynamic?.thresholds ?? [];
    const newThresholds = currentThresholds.filter((_, i) => i !== index);
    dispatch(change(form, 'shape.dynamic.thresholds', newThresholds));
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
        <div className="mt-5 flex flex-col gap-5">
          <UnconnectedField
            name="shape.dynamic.variable"
            label="Variable"
            component={VariablePickerControl}
            value={selectedVarId}
            onChange={handleVariableChange}
            options={variableOptions}
            disallowCreation
          />

          {selectedVar && dynamic?.type === 'discrete' && (
            <div className="flex flex-col gap-1">
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
                  <div
                    key={String(option.value)}
                    className="bg-surface-1 flex items-center gap-2.5 px-2.5 py-1"
                  >
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
            <div className="flex flex-col gap-1">
              <Heading
                level="h4"
                margin="none"
                className="text-muted mb-1 block text-sm"
              >
                Thresholds
              </Heading>
              <div className="bg-surface-1 flex items-center gap-2.5 rounded px-2.5 py-1 opacity-60">
                <span className="flex-1 text-sm">Below first threshold</span>
                <span className="text-muted text-xs">uses default shape</span>
              </div>
              {(dynamic.thresholds ?? []).map((threshold, index) => (
                <div
                  key={`threshold-${index}`}
                  className="bg-surface-1 flex items-center gap-2.5 rounded px-2.5 py-1"
                >
                  <span className="text-muted text-sm">≥</span>
                  <InputField
                    type="number"
                    step="any"
                    size="sm"
                    aria-label={`Threshold ${index + 1} value`}
                    className="w-28"
                    value={String(threshold.value)}
                    onChange={(nextValue) => {
                      const parsed = Number(nextValue);
                      if (nextValue !== '' && Number.isFinite(parsed)) {
                        handleThresholdValueChange(index, parsed);
                      }
                    }}
                    onBlur={() => {
                      const sorted = [...(dynamic.thresholds ?? [])].toSorted(
                        (a, b) => a.value - b.value,
                      );
                      dispatch(
                        change(form, 'shape.dynamic.thresholds', sorted),
                      );
                    }}
                  />
                  <span className="text-muted text-sm">→</span>
                  <ShapePickerControl
                    small
                    nodeColor={nodeColor}
                    aria-label={`Shape at threshold ${threshold.value}`}
                    value={threshold.shape}
                    onChange={(shape) =>
                      handleThresholdShapeChange(index, shape)
                    }
                  />
                  <IconButton
                    icon={<Trash2 />}
                    size="sm"
                    color="destructive"
                    variant="text"
                    onClick={() => handleRemoveThreshold(index)}
                    aria-label={`Remove threshold ${index + 1}`}
                  />
                </div>
              ))}
              {(dynamic.thresholds ?? []).length < 2 && (
                <Button
                  icon={<Plus />}
                  variant="dashed"
                  size="sm"
                  className="mt-1 self-start"
                  onClick={handleAddThreshold}
                >
                  Add threshold
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default ShapeVariableMapping;
