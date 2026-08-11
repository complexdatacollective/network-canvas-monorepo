import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { createSelector } from '@reduxjs/toolkit';
import { Plus } from 'lucide-react';
import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ComponentType,
  type FocusEventHandler,
  type ReactNode,
} from 'react';
import { useSelector } from 'react-redux';
import type { WrappedFieldProps } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import Hint from '@codaco/fresco-ui/form/Hint';
import { Label } from '@codaco/fresco-ui/Label';
import NewTypeDialog from '~/components/Dialog/NewTypeDialog';
import { getReduxFieldErrorState } from '~/components/Form/reduxFieldMeta';
import { cx } from '~/utils/cva';

import { getEdgeTypes, getNodeTypes } from '../../../../selectors/codebook';
import { asOptions } from '../../../../selectors/utils';
import PreviewEdge from './PreviewEdge';
import PreviewNode from './PreviewNode';

const getEdgeOptions = createSelector([getEdgeTypes], (edgeTypes) =>
  asOptions(edgeTypes),
);
const getNodeOptions = createSelector([getNodeTypes], (nodeTypes) =>
  asOptions(nodeTypes),
);

type EntitySelectControlProps = {
  'id'?: string;
  'name'?: string;
  'entityType': 'node' | 'edge';
  'value'?: string;
  'onChange'?: (value: string) => void;
  'onBlur'?: FocusEventHandler;
  'onFocus'?: FocusEventHandler;
  'promptBeforeChange'?: string | null;
  'blockChangeReason'?: string | null;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'required'?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-required'?: boolean;
};

export const EntitySelectControl = ({
  id,
  name,
  entityType,
  value,
  onChange,
  onBlur,
  onFocus,
  promptBeforeChange = null,
  blockChangeReason = null,
  disabled = false,
  readOnly = false,
  required = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: EntitySelectControlProps) => {
  const { confirm, openDialog } = useDialog();
  const edgeOptions = useSelector(getEdgeOptions);
  const nodeOptions = useSelector(getNodeOptions);
  const [showNewTypeDialog, setShowNewTypeDialog] = useState(false);
  const options = useMemo(
    () => (entityType === 'edge' ? edgeOptions : nodeOptions),
    [entityType, edgeOptions, nodeOptions],
  );

  const refuseBlockedChange = useCallback(() => {
    if (!value || !blockChangeReason) return false;

    void openDialog({
      type: 'acknowledge',
      intent: 'warning',
      title: `Cannot change ${entityType} type`,
      description: blockChangeReason,
      actions: { primary: { label: 'OK', value: true } },
    });
    return true;
  }, [value, blockChangeReason, openDialog, entityType]);

  const handleSelectItem = useCallback(
    (selectedItem: string) => {
      if (disabled || readOnly || selectedItem === value) return;

      if (refuseBlockedChange()) return;

      if (!value || !promptBeforeChange) {
        onChange?.(selectedItem);
        return;
      }

      void confirm({
        title: `Change ${entityType} type?`,
        description: promptBeforeChange,
        confirmLabel: 'Continue',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => onChange?.(selectedItem),
      });
    },
    [
      disabled,
      readOnly,
      value,
      refuseBlockedChange,
      promptBeforeChange,
      confirm,
      entityType,
      onChange,
    ],
  );

  const handleNewTypeComplete = useCallback(
    (newTypeId?: string) => {
      setShowNewTypeDialog(false);
      if (!newTypeId || disabled || readOnly) return;
      if (refuseBlockedChange()) return;
      onChange?.(newTypeId);
    },
    [disabled, readOnly, refuseBlockedChange, onChange],
  );

  return (
    <>
      <div
        data-name={name}
        onBlur={onBlur}
        onFocus={onFocus}
        className="flex w-full flex-col items-start gap-4"
      >
        <fieldset
          aria-labelledby={ariaLabelledBy}
          aria-label={
            ariaLabelledBy
              ? undefined
              : `${entityType === 'node' ? 'Node' : 'Edge'} type field`
          }
          aria-describedby={ariaDescribedBy}
          aria-disabled={readOnly || undefined}
          disabled={disabled}
          className={cx(
            'bg-input text-input-contrast flex w-full flex-col items-start rounded border-2 p-4',
            ariaInvalid && 'border-destructive',
            disabled && 'opacity-50',
            readOnly && 'opacity-70',
          )}
        >
          {options.length > 0 ? (
            <RadioGroup
              id={id}
              value={value ?? ''}
              onValueChange={(nextValue) => {
                if (typeof nextValue === 'string') handleSelectItem(nextValue);
              }}
              disabled={disabled}
              readOnly={readOnly}
              required={required}
              aria-label={
                ariaLabelledBy
                  ? undefined
                  : `${entityType === 'node' ? 'Node' : 'Edge'} type options`
              }
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid || undefined}
              aria-required={ariaRequired || required || undefined}
              className="flex flex-row flex-wrap justify-start gap-3"
            >
              {options.map(
                ({ label: optionLabel, color, shape, value: optionValue }) => (
                  <Radio.Root
                    key={optionValue}
                    value={optionValue}
                    nativeButton
                    render={(
                      // PreviewNode forwards to Node, whose drag props are
                      // pointer-based gestures — strip the HTML5 drag bag.
                      { onDrag, onDragStart, onDragEnd, ...renderProps },
                      state,
                    ) =>
                      entityType === 'edge' ? (
                        <PreviewEdge
                          {...renderProps}
                          label={optionLabel}
                          color={color ?? 'edge-color-seq-1'}
                          selected={state.checked}
                          surface={2}
                        />
                      ) : (
                        <PreviewNode
                          {...renderProps}
                          label={optionLabel}
                          color={color ?? 'node-color-seq-1'}
                          shape={shape}
                          selected={state.checked}
                        />
                      )
                    }
                  />
                ),
              )}
            </RadioGroup>
          ) : (
            <p className="w-full py-6 text-center text-sm text-current/70 italic">
              No {entityType} types currently defined
            </p>
          )}
        </fieldset>
        <Button
          type="button"
          icon={<Plus />}
          onClick={() => {
            if (refuseBlockedChange()) return;
            setShowNewTypeDialog(true);
          }}
          color="primary"
          disabled={disabled || readOnly}
        >
          Create new {entityType} type
        </Button>
      </div>
      <NewTypeDialog
        show={showNewTypeDialog}
        entityType={entityType}
        onComplete={handleNewTypeComplete}
        onCancel={() => setShowNewTypeDialog(false)}
      />
    </>
  );
};

type EntitySelectFieldProps = WrappedFieldProps & {
  entityType: 'node' | 'edge';
  label?: string | null;
  labelHidden?: boolean;
  hint?: ReactNode;
  promptBeforeChange?: string | null;
  blockChangeReason?: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

const EntitySelectFieldBase = ({
  input,
  meta,
  entityType,
  label,
  labelHidden = false,
  hint,
  required = false,
  ...props
}: EntitySelectFieldProps) => {
  const id = useId();
  const { errors, showErrors } = getReduxFieldErrorState(meta);
  const describedBy = [
    required && `${id}-required`,
    hint && `${id}-hint`,
    errors.length > 0 && `${id}-error`,
  ]
    .filter(Boolean)
    .join(' ');
  const fieldLabel = label ?? `${entityType === 'node' ? 'Node' : 'Edge'} type`;

  return (
    <div
      className="group flex w-full grow flex-col not-last:mb-8"
      data-field-name={input.name}
    >
      <div className={cx((!labelHidden || Boolean(hint)) && 'mb-2')}>
        <Label
          id={`${id}-label`}
          htmlFor={id}
          required={required}
          className={labelHidden ? 'sr-only' : undefined}
        >
          {fieldLabel}
        </Label>
        {required && (
          <span id={`${id}-required`} className="sr-only">
            Required
          </span>
        )}
        {hint && <Hint id={`${id}-hint`}>{hint}</Hint>}
      </div>
      <EntitySelectControl
        {...props}
        id={id}
        name={input.name}
        entityType={entityType}
        value={typeof input.value === 'string' ? input.value : undefined}
        onChange={(value) => input.onChange(value)}
        onBlur={() => input.onBlur?.(undefined)}
        onFocus={input.onFocus}
        required={required}
        aria-required={required || undefined}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy || undefined}
        aria-invalid={showErrors}
      />
      <FieldErrors
        id={`${id}-error`}
        name={input.name}
        errors={errors}
        show={showErrors}
      />
    </div>
  );
};

const EntitySelectField = EntitySelectFieldBase as unknown as ComponentType<
  Record<string, unknown>
>;

export default EntitySelectField;
