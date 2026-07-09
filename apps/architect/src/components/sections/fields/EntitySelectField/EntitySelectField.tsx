import { createSelector } from '@reduxjs/toolkit';
import { Plus, TriangleAlert } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import NewTypeDialog from '~/components/Dialog/NewTypeDialog';
import { cx } from '~/utils/cva';

import { getEdgeTypes, getNodeTypes } from '../../../../selectors/codebook';
import { asOptions } from '../../../../selectors/utils';
import PreviewEdge from './PreviewEdge';
import PreviewNode from './PreviewNode';

// Memoized selectors for options
const getEdgeOptions = createSelector([getEdgeTypes], (edgeTypes) =>
  asOptions(edgeTypes),
);
const getNodeOptions = createSelector([getNodeTypes], (nodeTypes) =>
  asOptions(nodeTypes),
);

type EntitySelectFieldProps = {
  entityType: 'node' | 'edge';
  label?: string | null;
  input: {
    value?: string;
    onChange: (value: string) => void;
  };
  meta: {
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
  promptBeforeChange?: string | null;
};

const EntitySelectField = ({
  entityType,
  label = null,
  input: { value, onChange },
  meta: { error, invalid, touched },
  promptBeforeChange = null,
}: EntitySelectFieldProps) => {
  const { confirm } = useDialog();
  const edgeOptions = useSelector(getEdgeOptions);
  const nodeOptions = useSelector(getNodeOptions);
  const [showNewTypeDialog, setShowNewTypeDialog] = useState(false);

  const options = useMemo(() => {
    if (entityType === 'edge') {
      return edgeOptions;
    }
    return nodeOptions;
  }, [entityType, edgeOptions, nodeOptions]);

  const hasError = !!touched && !!error;

  const handleClickItem = useCallback(
    (clickedItem: string) => {
      if (!value || !promptBeforeChange) {
        onChange(clickedItem);
        return;
      }

      void confirm({
        title: `Change ${entityType} type?`,
        description: promptBeforeChange,
        confirmLabel: 'Continue',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => onChange(clickedItem),
      });
    },
    [value, promptBeforeChange, onChange, confirm, entityType],
  );

  const handleOpenCreateNewType = useCallback(() => {
    setShowNewTypeDialog(true);
  }, []);

  const handleNewTypeComplete = useCallback(
    (newTypeId?: string) => {
      setShowNewTypeDialog(false);
      if (newTypeId) {
        onChange(newTypeId);
      }
    },
    [onChange],
  );

  const handleNewTypeCancel = useCallback(() => {
    setShowNewTypeDialog(false);
  }, []);

  const renderOptions = useCallback(
    () =>
      options.map(({ label: optionLabel, color, shape, value: optionValue }) =>
        entityType === 'edge' ? (
          <PreviewEdge
            key={optionValue}
            label={optionLabel}
            color={color ?? 'edge-color-seq-1'}
            onClick={() => handleClickItem(optionValue)}
            selected={value === optionValue}
            // surface-2 lifts the pills off the section panel's surface-1 background
            surface={2}
          />
        ) : (
          <PreviewNode
            key={optionValue}
            label={optionLabel}
            color={color ?? 'node-color-seq-1'}
            shape={shape}
            onClick={() => handleClickItem(optionValue)}
            selected={value === optionValue}
          />
        ),
      ),
    [options, value, handleClickItem, entityType],
  );

  return (
    <div className="flex flex-col items-start gap-5">
      {label && <h4>{label}</h4>}

      {options.length > 0 ? (
        <div
          className={cx(
            'flex flex-row flex-wrap justify-start gap-2.5 p-2.5',
            hasError && 'border-destructive border-4 border-solid',
          )}
        >
          {renderOptions()}
        </div>
      ) : (
        <p>
          No {entityType} types currently defined. Use the button below to
          create one.
        </p>
      )}
      <Button icon={<Plus />} onClick={handleOpenCreateNewType} color="primary">
        Create new {entityType} type
      </Button>
      {invalid && touched && (
        <div className="bg-destructive text-destructive-contrast flex items-center p-1 [&_svg]:max-h-5">
          <TriangleAlert aria-hidden />
          {error}
        </div>
      )}
      <NewTypeDialog
        show={showNewTypeDialog}
        entityType={entityType}
        onComplete={handleNewTypeComplete}
        onCancel={handleNewTypeCancel}
      />
    </div>
  );
};

export default EntitySelectField;
