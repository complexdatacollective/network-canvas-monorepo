import { get } from 'es-toolkit/compat';
import { Check, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
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
  className?: string;
  label: string;
  type: VariableType;
  animated?: boolean;
  editable?: boolean;
  onLabelChange?: (label: string) => void;
  validateLabel?: (label: string) => string | null | undefined;
};

export type ConnectedVariablePillProps = Pick<
  VariablePillProps,
  'animated' | 'className' | 'editable'
> & {
  uuid: string;
};

type VariablePillStyle = React.CSSProperties & {
  '--variable-pill-accent': string;
};

type VariablePillEditorAnchor = {
  left: number;
  maxWidth: number;
  top: number;
  width: number;
};

const DARK_COLOR_SUFFIX = '-dark';
const DEFAULT_EDITOR_MAX_WIDTH_REM = 20;
const EDIT_MODE_SCALE = 1.5;
const EDITOR_FRAME_GUTTER = 32;
const EDITOR_FRAME_MIN_WIDTH = 320;
const EDITOR_FRAME_PADDING = 24;
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

/**
 * How wide the zoomed name editor may grow the pill to. The trigger's default
 * `max-w-full` is a layout constraint, but the editor becomes a viewport
 * overlay and must be able to grow beyond that containing block. A concrete
 * caller-provided `max-w-*` remains an editor ceiling; the default percentage
 * cap falls back to the internal 20rem editing width.
 */
const getResolvedMaximumWidth = (
  element: HTMLElement,
  currentWidth: number,
) => {
  const computedMaxWidth = window.getComputedStyle(element).maxWidth.trim();
  const numericMaxWidth = Number.parseFloat(computedMaxWidth);
  const rootFontSize =
    Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    ) || 16;
  const defaultEditorMaxWidth = DEFAULT_EDITOR_MAX_WIDTH_REM * rootFontSize;

  if (!Number.isFinite(numericMaxWidth) || computedMaxWidth.endsWith('%')) {
    return Math.max(currentWidth, defaultEditorMaxWidth);
  }

  return Math.max(currentWidth, numericMaxWidth);
};

const getVariablePillStyle = (type: VariableType): VariablePillStyle => {
  const accentColor = getRawColorToken(getColorForType(type));
  return {
    '--variable-pill-accent': `oklch(var(--${accentColor}))`,
  };
};

const getVariablePillClassName = ({
  animated,
  className,
  interactive,
}: {
  animated?: boolean;
  className?: string;
  interactive?: boolean;
}) =>
  cx(
    // `variable-pill` marker — hook for same-area cascades in VariablePicker
    // (nested margin), PreviewRule (zoom), and the printable summary (scale).
    // `w-max` gives WebKit an explicit max-content basis. `w-fit` combined
    // with the formerly percentage-sized inner wrapper collapsed to the
    // ellipsis width in Safari instead of measuring the full label.
    'variable-pill font-monospace inline-flex h-12 w-max max-w-full min-w-0 flex-nowrap rounded-full p-0.5 text-base',
    'effect-shadow-sm',
    animated ? 'variable-pill-effect-border' : 'bg-(--variable-pill-accent)',
    !interactive && 'cursor-default',
    interactive &&
      'focusable hover:effect-shadow focus-visible:effect-shadow active:effect-shadow data-popup-open:effect-shadow cursor-pointer appearance-none border-0 text-left transition-[box-shadow,translate] duration-150 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 active:-translate-y-0.5 data-popup-open:-translate-y-0.5',
    className,
  );

function VariablePillContents({
  children,
  fill = false,
  type,
}: {
  children: React.ReactNode;
  fill?: boolean;
  type: VariableType;
}) {
  const icon = useMemo(() => getIconForType(type), [type]);

  return (
    // A two-track grid gives WebKit a stable intrinsic width: the icon is
    // fixed, while the label contributes its max-content width and may still
    // shrink to zero when the pill reaches its container or explicit max.
    <span
      className={cx(
        'text-text bg-surface grid h-full min-w-0 overflow-hidden rounded-[inherit]',
        fill
          ? 'w-full grid-cols-[3rem_minmax(0,1fr)]'
          : 'grid-cols-[3rem_minmax(0,auto)]',
      )}
    >
      <span className="flex items-center justify-center border-r border-white/25 bg-(--variable-pill-accent) [&_.icon]:w-5">
        <img className="icon opacity-80" src={icon} alt={`${type} attribute`} />
      </span>
      <span className="flex min-w-0 items-center justify-between">
        {children}
      </span>
    </span>
  );
}

/**
 * A variable reference whose interaction and visual treatment are independent.
 * Static pills use `<data>` semantics; editable pills use a button that opens
 * the focused name editor directly.
 */
export const VariablePill = ({
  animated = false,
  className,
  editable = false,
  label,
  onLabelChange,
  type,
  validateLabel,
}: VariablePillProps) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const closingRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const validationId = useId();

  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editorAnchor, setEditorAnchor] =
    useState<VariablePillEditorAnchor | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const [newName, setNewName] = useState(label);
  const hasChanges = newName !== label;

  const getValidation = (value: string) => {
    const required = validations.required('You must enter an attribute name')(
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
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const triggerBounds = trigger.getBoundingClientRect();

    closingRef.current = false;
    setClosing(false);
    setEditorAnchor({
      left: triggerBounds.left,
      maxWidth: getResolvedMaximumWidth(trigger, triggerBounds.width),
      top: triggerBounds.top,
      width: triggerBounds.width,
    });
    setNewName(label);
    const nextValidation = getValidation(label);
    setValidation(nextValidation);
    setIsValid(!nextValidation);
    setAnnouncement(`Editing attribute ${label}`);
    restoreFocusRef.current = true;
    setEditing(true);
  };

  const closeEditor = ({
    announcement: nextAnnouncement,
    beforeClose,
  }: {
    announcement: string;
    beforeClose?: () => void;
  }) => {
    if (closingRef.current) {
      return;
    }

    closingRef.current = true;
    setClosing(true);

    beforeClose?.();
    setEditing(false);
    setValidation(null);
    setAnnouncement(nextAnnouncement);
  };

  const handleCancel = () => {
    closeEditor({
      announcement: 'Attribute name edit cancelled',
    });
  };

  const onEditComplete = () => {
    if (!isValid || !hasChanges || !onLabelChange) {
      return;
    }

    closeEditor({
      announcement: `Attribute renamed to ${newName}`,
      beforeClose: () => onLabelChange(newName),
    });
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

  const style = getVariablePillStyle(type);
  const editorFrame = useMemo(() => {
    if (!editorAnchor) {
      return null;
    }

    const availableWidth = window.innerWidth - EDITOR_FRAME_GUTTER;
    const availablePillWidth =
      (availableWidth - EDITOR_FRAME_PADDING * 2) / EDIT_MODE_SCALE;
    const targetPillWidth = Math.min(editorAnchor.maxWidth, availablePillWidth);
    const initialPillWidth = Math.min(
      editorAnchor.width,
      availableWidth - EDITOR_FRAME_PADDING * 2,
    );
    const frameWidth = Math.min(
      availableWidth,
      Math.max(
        EDITOR_FRAME_MIN_WIDTH,
        initialPillWidth + EDITOR_FRAME_PADDING * 2,
        targetPillWidth * EDIT_MODE_SCALE + EDITOR_FRAME_PADDING * 2,
      ),
    );
    const centeredLeft =
      editorAnchor.left + editorAnchor.width / 2 - frameWidth / 2;
    const left = Math.min(
      window.innerWidth - EDITOR_FRAME_GUTTER / 2 - frameWidth,
      Math.max(EDITOR_FRAME_GUTTER / 2, centeredLeft),
    );

    return {
      initialPillWidth,
      targetPillWidth,
      style: {
        left,
        top: editorAnchor.top - EDITOR_FRAME_PADDING,
        width: frameWidth,
      } satisfies React.CSSProperties,
      pillStyle: {
        ...style,
        width: `${targetPillWidth}px`,
        minWidth: `${Math.min(initialPillWidth, targetPillWidth)}px`,
        maxWidth: `${Math.max(initialPillWidth, targetPillWidth)}px`,
      } satisfies VariablePillStyle,
    };
  }, [editorAnchor, style]);

  if (!editable) {
    return (
      <data
        value={label}
        className={getVariablePillClassName({
          animated,
          className,
        })}
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
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-label={`Edit attribute name: ${label}`}
              className={getVariablePillClassName({
                animated,
                className,
                interactive: true,
              })}
              style={style}
              onClick={handleStartEditing}
            >
              <VariablePillContents type={type}>
                <span className="m-0 min-w-0 grow overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap">
                  {label}
                </span>
              </VariablePillContents>
            </button>
          }
        />
        <TooltipContent side="top">Edit attribute name: {label}</TooltipContent>
      </Tooltip>

      <Modal
        open={editing}
        forceBackdrop
        backdropClassName="z-30"
        onOpenChange={(open) => {
          if (!open) {
            handleCancel();
          }
        }}
      >
        {editorFrame && (
          <ModalPopup
            key="variable-pill-editor"
            aria-label="Edit attribute name"
            className="fixed z-40 flex flex-col items-center gap-6 p-6 outline-none"
            style={editorFrame.style}
            initial={{ opacity: 0.9999 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0.9999 }}
            transition={{ duration: reduceMotion ? 0 : 0.4 }}
          >
            <motion.div
              initial={
                reduceMotion
                  ? false
                  : { scale: 1, width: editorFrame.initialPillWidth }
              }
              animate={{
                scale: reduceMotion ? 1 : EDIT_MODE_SCALE,
                width: editorFrame.targetPillWidth,
              }}
              exit={{
                scale: 1,
                width: editorFrame.initialPillWidth,
              }}
              transition={
                reduceMotion ? { duration: 0 } : EDIT_MODE_LAYOUT_SPRING
              }
              className={getVariablePillClassName({
                animated: false,
              })}
              style={editorFrame.pillStyle}
            >
              <VariablePillContents fill type={type}>
                <InputField
                  autoFocus
                  aria-label="Attribute name"
                  aria-invalid={validation ? true : undefined}
                  aria-describedby={validation ? validationId : undefined}
                  className="h-full w-full rounded-l-none! outline-none!"
                  placeholder="Enter an attribute name..."
                  value={newName}
                  onChange={handleUpdateName}
                  onKeyDown={handleKeyDown}
                />
              </VariablePillContents>
            </motion.div>

            {validation && (
              <FieldErrors
                id={validationId}
                name="variable-name"
                errors={[validation]}
                show
                variant="box"
              />
            )}

            <motion.div
              className="flex items-center gap-3"
              initial={reduceMotion ? false : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{
                duration: reduceMotion ? 0 : 0.24,
                delay: reduceMotion ? 0 : 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Button
                size="sm"
                variant="default"
                icon={<X aria-hidden />}
                disabled={closing}
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                color="primary"
                icon={<Check aria-hidden />}
                disabled={closing || !isValid || !hasChanges}
                onClick={onEditComplete}
              >
                Save Changes
              </Button>
            </motion.div>
          </ModalPopup>
        )}
      </Modal>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
};

const ConnectedVariablePillComponent = ({
  animated = false,
  className,
  editable = false,
  uuid,
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
      className={className}
      editable={editable}
      label={name ?? ''}
      type={type}
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
