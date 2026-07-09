import { get } from 'es-toolkit/compat';
import { Check, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useMemo, useRef, useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import type { VariableType } from '@codaco/protocol-validation';
import TextInput from '~/components/Form/Fields/Text';
import { getColorForType, getIconForType } from '~/config/variables';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableByUUID } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';
import {
  getVariablesForSubject,
  makeGetVariableWithEntity,
} from '~/selectors/codebook';
import { cx } from '~/utils/cva';
import { validations } from '~/utils/validations';

const EDIT_COMPLETE_BUTTON_ID = 'editCompleteButton';

type BaseVariablePillProps = {
  type: VariableType;
  children: React.ReactNode;
  width?: string;
  summary?: boolean;
};

type VariablePillStyle = React.CSSProperties & {
  '--variable-pill-accent': string;
  '--variable-pill-width'?: string;
};

const BaseVariablePill = React.forwardRef<
  HTMLDivElement,
  BaseVariablePillProps
>(({ type, children, width, summary }, ref) => {
  const icon = useMemo(() => getIconForType(type), [type]);
  const accentColor = getColorForType(type);
  const style: VariablePillStyle = {
    '--variable-pill-accent': `oklch(var(--${accentColor}))`,
  };

  if (width) {
    style['--variable-pill-width'] = width;
  }

  return (
    // `variable-pill` marker — hook for two remaining same-area cascades:
    // `VariablePicker.tsx` (mb on nested pills) and `PreviewRule.tsx` (zoom).
    <motion.div
      className={cx(
        'variable-pill variable-pill-effect-border effect-shadow-sm font-monospace inline-flex h-12 w-(--variable-pill-width,20rem) flex-nowrap rounded-full p-0.5 text-base',
        summary && 'm-2 max-w-[24rem] zoom-[0.8]',
      )}
      style={style}
      ref={ref}
    >
      <div className="text-text flex h-full w-full overflow-hidden rounded-[inherit] bg-white">
        <div className="flex shrink-0 basis-12 items-center justify-center border-r border-white/25 bg-(--variable-pill-accent) [&_.icon]:w-5">
          <img className="icon opacity-80" src={icon} alt={type} />
        </div>
        <div className="flex w-[calc(100%-3rem)] flex-1 items-center justify-between">
          {children}
        </div>
      </div>
    </motion.div>
  );
});

type SimpleVariablePillProps = {
  label: string;
} & BaseVariablePillProps;

export const SimpleVariablePill = ({
  label,
  ...props
}: SimpleVariablePillProps) => (
  // eslint-disable-next-line react/jsx-props-no-spreading
  <BaseVariablePill {...props}>
    <motion.span className="m-0 shrink-0 grow px-6 break-keep">
      {label}
    </motion.span>
  </BaseVariablePill>
);

type EditableVariablePillProps = {
  uuid: string;
  width?: string;
};

const EditableVariablePill = ({ uuid, width }: EditableVariablePillProps) => {
  const dispatch = useAppDispatch();
  const ref = useRef<HTMLDivElement>(null);

  const [editing, setIsEditing] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const variableSelector = useMemo(
    () => makeGetVariableWithEntity(uuid),
    [uuid],
  );
  const variable = useAppSelector(variableSelector);
  const { name, type, entity, entityType } = variable ?? {};

  const [newName, setNewName] = useState(name ?? '');

  const handleCancel = () => {
    setIsEditing(false);
    setValidation(null);
    setNewName(name ?? '');
  };

  const handleBlur = (e: React.FocusEvent) => {
    // relatedTarget is the element that the focus event was fired from
    const target = get(e, 'relatedTarget.id', null);

    // Don't cancel if the user clicked the submit button
    if (target === EDIT_COMPLETE_BUTTON_ID) {
      return;
    }
    handleCancel();
  };

  const onEditComplete = () => {
    const action = updateVariableByUUID(uuid, { name: newName }, true);
    dispatch(action);
    setValidation(null);
    setIsEditing(false);
  };

  const subject = useMemo(
    () => ({
      entity: (entity || '') as 'node' | 'edge' | 'ego',
      type: (entityType || 'node') as 'node' | 'edge' | 'ego',
    }),
    [entity, entityType],
  );
  const existingVariables = useAppSelector((state: RootState) =>
    getVariablesForSubject(state, subject),
  );

  const existingVariableNames = useMemo(
    () =>
      Object.keys(existingVariables)
        .filter((variableId) => variableId !== uuid) // Exclude current variable being edited
        .map((variableId) => get(existingVariables[variableId], 'name')),
    [existingVariables, uuid],
  );

  const handleUpdateName = (event: React.ChangeEvent<HTMLInputElement>) => {
    const {
      target: { value },
    } = event;
    setNewName(value);

    const required = validations.required('You must enter a variable name')(
      value,
    );
    const unique = validations.uniqueByList(existingVariableNames)(value);
    const allowed = validations.allowedVariableName()(value);

    const validationResult = required || unique || allowed || null;
    setValidation(validationResult);
    setCanSubmit(!validationResult);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent any parent form from submitting

      if (canSubmit) {
        onEditComplete();
      }
    }
  };

  if (!type) {
    return null;
  }

  return (
    <BaseVariablePill type={type as VariableType} width={width} ref={ref}>
      <AnimatePresence initial={false} mode="wait">
        {editing ? (
          <motion.div
            key="edit"
            className="flex-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Tooltip open={!!validation}>
              <TooltipTrigger
                render={
                  <div className="w-full flex-auto">
                    <TextInput
                      autoFocus
                      placeholder="Enter a new variable name..."
                      input={{
                        value: newName,
                        onChange: handleUpdateName,
                        onBlur: handleBlur,
                        onKeyDown: handleKeyDown,
                      }}
                      adornmentRight={
                        <motion.div className="relative right-5 flex shrink-0 grow-0">
                          <motion.div
                            title="Finished"
                            aria-label="Finished"
                            initial={{ x: '100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            role="button"
                            tabIndex={0} // Needed to allow focus
                            id={EDIT_COMPLETE_BUTTON_ID}
                            onClick={onEditComplete}
                            className={cx(
                              'cursor-pointer [&_svg]:size-5',
                              !canSubmit && 'cursor-not-allowed grayscale',
                            )}
                          >
                            <Check aria-hidden className="text-success" />
                          </motion.div>
                          <motion.div
                            title="Cancel"
                            aria-label="Cancel"
                            initial={{ x: '100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.6 }}
                            role="button"
                            tabIndex={0} // Needed to allow focus
                            onClick={handleCancel}
                            className="ml-2.5 cursor-pointer [&_svg]:size-5"
                          >
                            <X aria-hidden className="text-destructive" />
                          </motion.div>
                        </motion.div>
                      }
                    />
                  </div>
                }
              />
              <TooltipContent
                side="bottom"
                className="bg-destructive text-destructive-contrast"
              >
                {validation}
              </TooltipContent>
            </Tooltip>
          </motion.div>
        ) : (
          <motion.span
            key="label"
            className="m-0 w-full shrink-0 grow cursor-text overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsEditing(true)}
            title="Click to rename this variable..."
          >
            {name}
          </motion.span>
        )}
      </AnimatePresence>
    </BaseVariablePill>
  );
};

export default React.memo(EditableVariablePill);
