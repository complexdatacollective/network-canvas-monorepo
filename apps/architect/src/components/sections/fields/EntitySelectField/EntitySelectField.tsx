import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { createSelector } from '@reduxjs/toolkit';
import { Plus } from 'lucide-react';
import { createElement, useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import NewTypeDialog from '~/components/Dialog/NewTypeDialog';
import { cx } from '~/utils/cva';

import { getEdgeTypes, getNodeTypes } from '../../../../selectors/codebook';
import { asOptions } from '../../../../selectors/utils';
import PreviewEdge from './PreviewEdge';
import PreviewNode from './PreviewNode';
const messages = defineMessages({
  cannotChangeType: {
    id: 'architect.sections.fields.entitySelectField.entitySelectField.cannotChangeType',
    defaultMessage:
      'Cannot change {entityType, select, node {node} other {edge}} type',
    description:
      'The title text in components / sections / fields / EntitySelectField / EntitySelectField.',
  },
  oK: {
    id: 'architect.sections.fields.entitySelectField.entitySelectField.oK',
    defaultMessage: 'OK',
    description:
      'The label text in components / sections / fields / EntitySelectField / EntitySelectField.',
  },
  changeType: {
    id: 'architect.sections.fields.entitySelectField.entitySelectField.changeType',
    defaultMessage:
      'Change {entityType, select, node {node} other {edge}} type?',
    description:
      'The title text in components / sections / fields / EntitySelectField / EntitySelectField.',
  },
  typeField: {
    id: 'architect.sections.fields.entitySelectField.entitySelectField.typeField',
    defaultMessage: '{value1, select, true {Node} other {Edge}} type field',
    description:
      'The aria-label text in components / sections / fields / EntitySelectField / EntitySelectField.',
  },
  typeOptions: {
    id: 'architect.sections.fields.entitySelectField.entitySelectField.typeOptions',
    defaultMessage: '{value1, select, true {Node} other {Edge}} type options',
    description:
      'The aria-label text in components / sections / fields / EntitySelectField / EntitySelectField.',
  },
  noTypesCurrentlyDefined: {
    id: 'architect.sections.fields.entitySelectField.entitySelectField.noTypesCurrentlyDefined',
    defaultMessage:
      'No {entityType, select, node {node} other {edge}} types currently defined',
    description:
      'Visible text in components / sections / fields / EntitySelectField / EntitySelectField.',
  },
  createNewType: {
    id: 'architect.sections.fields.entitySelectField.entitySelectField.createNewType',
    defaultMessage:
      'Create new {entityType, select, node {node} other {edge}} type',
    description:
      'Visible text in components / sections / fields / EntitySelectField / EntitySelectField.',
  },
});

const getEdgeOptions = createSelector([getEdgeTypes], (edgeTypes) =>
  asOptions(edgeTypes),
);
const getNodeOptions = createSelector([getNodeTypes], (nodeTypes) =>
  asOptions(nodeTypes),
);

type EntitySelectFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    entityType: 'node' | 'edge';
    /** Asks for confirmation before replacing an existing selection. */
    promptBeforeChange?: string | null;
    /** Refuses any change and explains why. */
    blockChangeReason?: string | null;
    /** Only reaches the control through `UnconnectedField`; `Field` strips
     * validation props and signals the same thing via `aria-required`. */
    required?: boolean;
    /** Block creating new entities. Used when in deeply nested dialogs */
    allowCreation?: boolean;
  }
>;

/**
 * Picks a node or edge type, with an inline "create a new type" flow.
 * Labelling belongs to the surrounding field — pass it through
 * `ArchitectField`'s `label`/`hint`. The `aria-label` fallbacks below only
 * apply to standalone use (the Query rule editors), where there is no field.
 */
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
  allowCreation = true,
}: EntitySelectFieldProps) => {
  const intl = useAppIntl();
  const { confirm, openDialog } = useDialog();
  const edgeOptions = useSelector(getEdgeOptions);
  const nodeOptions = useSelector(getNodeOptions);
  const [showNewTypeDialog, setShowNewTypeDialog] = useState(false);
  const options = useMemo(
    () => (entityType === 'edge' ? edgeOptions : nodeOptions),
    [entityType, edgeOptions, nodeOptions],
  );
  const isRequired = required || Boolean(ariaRequired);

  const refuseBlockedChange = useCallback(() => {
    if (!value || !blockChangeReason) return false;

    void openDialog({
      type: 'acknowledge',
      intent: 'warning',
      title: createElement(AppMessage, {
        message: messages.cannotChangeType,
        values: {
          entityType: entityType,
        },
      }),
      description: blockChangeReason,
      actions: {
        primary: {
          label: createElement(AppMessage, { message: messages.oK }),
          value: true,
        },
      },
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
        title: createElement(AppMessage, {
          message: messages.changeType,
          values: {
            entityType: entityType,
          },
        }),
        description: promptBeforeChange,
        confirmLabel: createElement(AppMessage, {
          message: commonMessages.continue,
        }),
        cancelLabel: createElement(AppMessage, {
          message: commonMessages.cancel,
        }),
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
              : intl.formatMessage(messages.typeField, {
                  value1: String(entityType === 'node'),
                })
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
              required={isRequired}
              aria-label={
                ariaLabelledBy
                  ? undefined
                  : intl.formatMessage(messages.typeOptions, {
                      value1: String(entityType === 'node'),
                    })
              }
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid || undefined}
              aria-required={isRequired || undefined}
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
              {intl.formatMessage(messages.noTypesCurrentlyDefined, {
                entityType: entityType,
              })}
            </p>
          )}
        </fieldset>
        {allowCreation && (
          <>
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
              {intl.formatMessage(messages.createNewType, {
                entityType: entityType,
              })}
            </Button>
            <NewTypeDialog
              show={showNewTypeDialog}
              entityType={entityType}
              onComplete={handleNewTypeComplete}
              onCancel={() => setShowNewTypeDialog(false)}
            />
          </>
        )}
      </div>
    </>
  );
};
