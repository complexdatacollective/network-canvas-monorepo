import { get } from 'es-toolkit/compat';
import { Check, Pencil, X } from 'lucide-react';
import { LayoutGroup, motion, MotionConfig } from 'motion/react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import type { VariableType } from '@codaco/protocol-validation';
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

export type VariablePillProps = {
  label: string;
  type: VariableType;
  width?: string;
  animated?: boolean;
  editable?: boolean;
  onLabelChange?: (label: string) => void;
  validateLabel?: (label: string) => string | null | undefined;
};

export type ConnectedVariablePillProps = {
  uuid: string;
  width?: string;
  animated?: boolean;
  editable?: boolean;
};

type VariablePillStyle = React.CSSProperties & {
  '--variable-pill-accent': string;
  '--variable-pill-width'?: string;
};

const DARK_COLOR_SUFFIX = '-dark';
const EDIT_MODE_SCALE = 1.05;
const EDIT_MODE_LAYOUT_SPRING = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 1.2,
} as const;

const getRawColorToken = (color: string) =>
  color.endsWith(DARK_COLOR_SUFFIX)
    ? `${color.slice(0, -DARK_COLOR_SUFFIX.length)}--dark`
    : color;

const getVariablePillStyle = (
  type: VariableType,
  width?: string,
): VariablePillStyle => {
  const accentColor = getRawColorToken(getColorForType(type));
  const style: VariablePillStyle = {
    '--variable-pill-accent': `oklch(var(--${accentColor}))`,
  };

  if (width) {
    style['--variable-pill-width'] = width;
  }

  return style;
};

const getVariablePillClassName = ({
  animated,
  interactive,
  modal,
  raised,
}: {
  animated?: boolean;
  interactive?: boolean;
  modal?: boolean;
  raised?: boolean;
}) =>
  cx(
    // `variable-pill` marker — hook for two remaining same-area cascades:
    // `VariablePicker.tsx` (mb on nested pills) and `PreviewRule.tsx` (zoom).
    'variable-pill font-monospace inline-flex h-12 w-(--variable-pill-width,20rem) flex-nowrap rounded-full p-0.5 text-base',
    raised ? 'effect-shadow' : 'effect-shadow-sm',
    animated ? 'variable-pill-effect-border' : 'bg-(--variable-pill-accent)',
    !interactive && 'cursor-default',
    interactive &&
      'focusable hover:effect-shadow cursor-pointer appearance-none border-0 text-left transition-[box-shadow,translate] duration-150 ease-out hover:-translate-y-0.5',
    raised && '-translate-y-0.5',
    modal &&
      'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 outline-none',
  );

function VariablePillContents({
  children,
  type,
}: {
  children: React.ReactNode;
  type: VariableType;
}) {
  const icon = useMemo(() => getIconForType(type), [type]);

  return (
    <span className="text-text bg-surface flex h-full w-full overflow-hidden rounded-[inherit]">
      <span className="flex shrink-0 basis-12 items-center justify-center border-r border-white/25 bg-(--variable-pill-accent) [&_.icon]:w-5">
        <img className="icon opacity-80" src={icon} alt={`${type} variable`} />
      </span>
      <span className="flex w-[calc(100%-3rem)] min-w-0 flex-1 items-center justify-between">
        {children}
      </span>
    </span>
  );
}

/**
 * A variable reference whose interaction and visual treatment are independent.
 * Static pills use `<data>` semantics; editable pills use a button that opens
 * variable details and the focused name editor.
 */
export const VariablePill = ({
  animated = false,
  editable = false,
  label,
  onLabelChange,
  type,
  validateLabel,
  width,
}: VariablePillProps) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const instanceId = useId();
  const validationId = useId();
  const layoutGroupId = `variable-pill-group-${instanceId}`;
  const layoutId = `variable-pill-${instanceId}`;

  const [editing, setEditing] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const [newName, setNewName] = useState(label);
  const hasChanges = newName !== label;

  const getValidation = (value: string) => {
    const required = validations.required('You must enter a variable name')(
      value,
    );
    const external = validateLabel?.(value);
    const allowed = validations.allowedVariableName()(value);

    return required || external || allowed || null;
  };

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      triggerRef.current?.focus();
      restoreFocusRef.current = false;
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) {
      setNewName(label);
    }
  }, [editing, label]);

  const handleStartEditing = () => {
    setPopoverOpen(false);
    setNewName(label);
    const nextValidation = getValidation(label);
    setValidation(nextValidation);
    setIsValid(!nextValidation);
    setAnnouncement(`Editing variable ${label}`);
    restoreFocusRef.current = true;
    setEditing(true);
  };

  const handleCancel = () => {
    setPopoverOpen(false);
    setEditing(false);
    setValidation(null);
    setNewName(label);
    setAnnouncement('Variable name edit cancelled');
  };

  const onEditComplete = () => {
    if (!isValid || !hasChanges || !onLabelChange) {
      return;
    }

    onLabelChange(newName);
    setPopoverOpen(false);
    setValidation(null);
    setEditing(false);
    setAnnouncement(`Variable renamed to ${newName}`);
  };

  const handleUpdateName = (value: string | undefined) => {
    const nextValue = value ?? '';
    setNewName(nextValue);

    const validationResult = getValidation(nextValue);
    setValidation(validationResult);
    setIsValid(!validationResult);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();

      if (isValid && hasChanges) {
        onEditComplete();
      }
    }
  };

  const style = getVariablePillStyle(type, width);
  const modalStyle = { ...style, scale: EDIT_MODE_SCALE };

  if (!editable) {
    return (
      <data
        value={label}
        className={getVariablePillClassName({ animated })}
        style={style}
      >
        <VariablePillContents type={type}>
          <span className="m-0 min-w-0 grow overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap">
            {label}
          </span>
        </VariablePillContents>
      </data>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={layoutGroupId}>
        {!editing && (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger
              nativeButton
              openOnHover
              delay={150}
              closeDelay={200}
              render={
                <motion.button
                  ref={triggerRef}
                  type="button"
                  layoutId={layoutId}
                  className={getVariablePillClassName({
                    animated,
                    interactive: true,
                    raised: popoverOpen,
                  })}
                  style={style}
                  aria-label={`Variable ${label}, ${type}. Show variable details`}
                  onFocus={(event) => {
                    if (
                      !restoreFocusRef.current &&
                      event.currentTarget.matches(':focus-visible')
                    ) {
                      setPopoverOpen(true);
                    }
                  }}
                >
                  <VariablePillContents type={type}>
                    <span className="m-0 min-w-0 grow overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap">
                      {label}
                    </span>
                  </VariablePillContents>
                </motion.button>
              }
            />
            <PopoverContent
              side="top"
              align="start"
              className="w-80"
              aria-label="Variable details"
            >
              <div className="flex flex-col gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-heading text-muted text-xs font-bold tracking-wide">
                    Variable name
                  </span>
                  <p className="font-monospace m-0 max-w-full text-sm break-all">
                    {label}
                  </p>
                </div>
                <Button
                  size="sm"
                  color="primary"
                  icon={<Pencil aria-hidden />}
                  onClick={handleStartEditing}
                >
                  Edit variable name
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <Modal
          open={editing}
          onOpenChange={(open) => {
            if (!open) {
              handleCancel();
            }
          }}
        >
          {editing && (
            <ModalPopup
              layoutId={layoutId}
              transition={{ layout: EDIT_MODE_LAYOUT_SPRING }}
              className={getVariablePillClassName({
                animated,
                modal: true,
              })}
              style={modalStyle}
              aria-label="Edit variable name"
            >
              <VariablePillContents type={type}>
                <InputField
                  autoFocus
                  aria-label="Variable name"
                  aria-invalid={validation ? true : undefined}
                  aria-describedby={validation ? validationId : undefined}
                  className="h-full w-full rounded-l-none! outline-none!"
                  placeholder="Enter a variable name..."
                  value={newName}
                  onChange={handleUpdateName}
                  onKeyDown={handleKeyDown}
                />
              </VariablePillContents>

              <motion.div
                className="absolute top-[calc(100%+0.75rem)] left-1/2 flex min-w-max -translate-x-1/2 flex-col items-center gap-2"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 40,
                  delay: 0.15,
                }}
              >
                {validation && (
                  <div className="[&>div]:bg-destructive! [&>div]:text-destructive-contrast! [&>div]:px-4 [&>div]:py-2">
                    <FieldErrors
                      id={validationId}
                      name="variable-name"
                      errors={[validation]}
                      show
                    />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="default"
                    icon={<X aria-hidden />}
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    icon={<Check aria-hidden />}
                    disabled={!isValid || !hasChanges}
                    onClick={onEditComplete}
                  >
                    Save changes
                  </Button>
                </div>
              </motion.div>
            </ModalPopup>
          )}
        </Modal>
      </LayoutGroup>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </MotionConfig>
  );
};

const ConnectedVariablePillComponent = ({
  animated = false,
  editable = false,
  uuid,
  width,
}: ConnectedVariablePillProps) => {
  const dispatch = useAppDispatch();
  const variableSelector = useMemo(
    () => makeGetVariableWithEntity(uuid),
    [uuid],
  );
  const variable = useAppSelector(variableSelector);
  const { name, type, entity, entityType } = variable ?? {};

  // Ego variables live at `codebook.ego.variables`, so `type` must stay
  // undefined for them rather than defaulting to an entity type name.
  const subject = useMemo(
    () => ({ entity: entity ?? 'node', type: entityType ?? undefined }),
    [entity, entityType],
  );
  const existingVariables = useAppSelector((state: RootState) =>
    getVariablesForSubject(state, subject),
  );

  const existingVariableNames = useMemo(
    () =>
      Object.entries(existingVariables ?? {})
        .filter(([variableId]) => variableId !== uuid)
        .map(([, existingVariable]) => get(existingVariable, 'name')),
    [existingVariables, uuid],
  );

  if (!type) {
    return null;
  }

  return (
    <VariablePill
      animated={animated}
      editable={editable}
      label={name ?? ''}
      type={type as VariableType}
      width={width}
      onLabelChange={(nextName) => {
        const action = updateVariableByUUID(uuid, { name: nextName });
        void dispatch(action);
      }}
      validateLabel={(nextName) =>
        validations.uniqueByList(existingVariableNames)(nextName)
      }
    />
  );
};

export const ConnectedVariablePill = React.memo(ConnectedVariablePillComponent);
