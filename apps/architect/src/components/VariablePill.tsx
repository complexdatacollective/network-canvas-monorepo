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

type VariablePillSizingProps = {
  width?: string;
  minWidth?: string;
  maxWidth?: string;
};

export type VariablePillProps = VariablePillSizingProps & {
  label: string;
  type: VariableType;
  animated?: boolean;
  editable?: boolean;
  onLabelChange?: (label: string) => void;
  validateLabel?: (label: string) => string | null | undefined;
};

export type ConnectedVariablePillProps = VariablePillSizingProps & {
  uuid: string;
  animated?: boolean;
  editable?: boolean;
};

type VariablePillStyle = React.CSSProperties & {
  '--variable-pill-accent': string;
  '--variable-pill-width': string;
  '--variable-pill-min-width': string;
  '--variable-pill-max-width': string;
};

type VariablePillEditorAnchor = {
  left: number;
  maxWidth: number;
  top: number;
  width: number;
};

const DARK_COLOR_SUFFIX = '-dark';
// Both bounds are capped at the pill's containing block, never a bare length.
// A variable name renders `white-space: nowrap`, so the pill's min-content IS
// the whole token however narrow its container: measured 312px inside a 210px
// box, which is what still pushed the family pedigree editor past a 390px
// viewport after its rows learned to stack (#1388). No amount of `min-w-0`
// above it helps — a percentage cap is the only thing that can clamp a
// nowrap run. `min()` keeps the intended 12–20rem band wherever there is room
// and yields to the container when there is not.
const DEFAULT_MAX_WIDTH_REM = 20;
const DEFAULT_MIN_WIDTH = 'min(12rem, 100%)';
const DEFAULT_MAX_WIDTH = `min(${DEFAULT_MAX_WIDTH_REM}rem, 100%)`;
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
 * How wide the zoomed name editor may grow the pill to. This is a DESIGN
 * ceiling, not a layout one: the editor is an overlay positioned against the
 * viewport (see `editorFrame`), so the pill's own container never constrains
 * it.
 *
 * The unreadable-value branch therefore falls back to the design maximum, not
 * to `currentWidth`. `max-width` is now `min(20rem, 100%)` — the `100%` is what
 * keeps an inline pill inside its container (#1388) — and `Number.parseFloat`
 * cannot read a `min()`. Returning the element's current width there would
 * silently pin the editor to whatever the pill happened to be, which for a
 * clipped long name is exactly the case the editor exists to open up.
 */
const getResolvedMaximumWidth = (
  element: HTMLElement,
  currentWidth: number,
) => {
  const computedMaxWidth = window.getComputedStyle(element).maxWidth.trim();
  const numericMaxWidth = Number.parseFloat(computedMaxWidth);

  if (!Number.isFinite(numericMaxWidth)) {
    const rootFontSize =
      Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      ) || 16;
    return Math.max(currentWidth, DEFAULT_MAX_WIDTH_REM * rootFontSize);
  }

  if (computedMaxWidth.endsWith('%')) {
    const containingWidth =
      element.parentElement?.getBoundingClientRect().width ?? currentWidth;
    return Math.max(currentWidth, containingWidth * (numericMaxWidth / 100));
  }

  return Math.max(currentWidth, numericMaxWidth);
};

const getVariablePillStyle = (
  type: VariableType,
  {
    width,
    minWidth,
    maxWidth,
  }: Pick<VariablePillProps, 'width' | 'minWidth' | 'maxWidth'>,
): VariablePillStyle => {
  const accentColor = getRawColorToken(getColorForType(type));
  return {
    '--variable-pill-accent': `oklch(var(--${accentColor}))`,
    '--variable-pill-width': width ?? 'fit-content',
    '--variable-pill-min-width': minWidth ?? DEFAULT_MIN_WIDTH,
    '--variable-pill-max-width': maxWidth ?? width ?? DEFAULT_MAX_WIDTH,
  };
};

const getVariablePillClassName = ({
  animated,
  fluid,
  interactive,
}: {
  animated?: boolean;
  fluid?: boolean;
  interactive?: boolean;
}) =>
  cx(
    // `variable-pill` marker — hook for same-area cascades in VariablePicker
    // (nested margin), PreviewRule (zoom), and the printable summary (scale).
    'variable-pill font-monospace inline-flex h-12 w-(--variable-pill-width) max-w-(--variable-pill-max-width) min-w-(--variable-pill-min-width) flex-nowrap rounded-full p-0.5 text-base',
    'effect-shadow-sm',
    animated ? 'variable-pill-effect-border' : 'bg-(--variable-pill-accent)',
    !interactive && 'cursor-default',
    fluid && 'flex-1',
    interactive &&
      'focusable hover:effect-shadow focus-visible:effect-shadow active:effect-shadow data-popup-open:effect-shadow cursor-pointer appearance-none border-0 text-left transition-[box-shadow,translate] duration-150 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 active:-translate-y-0.5 data-popup-open:-translate-y-0.5',
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
    // `min-w-0` so the pill can actually reach the bound above it. This span is
    // the pill's only flex item, and a variable name is an unbreakable
    // monospace token — at the default `min-width: auto` its min-content became
    // the pill's, then the picker's, then the whole editor's, so `max-width`
    // had nothing left to clamp. The label inside already clips (`min-w-0` +
    // `overflow-hidden`); this lets that clipping be reached.
    <span className="text-text bg-surface flex h-full w-full min-w-0 overflow-hidden rounded-[inherit]">
      <span className="flex shrink-0 basis-12 items-center justify-center border-r border-white/25 bg-(--variable-pill-accent) [&_.icon]:w-5">
        <img className="icon opacity-80" src={icon} alt={`${type} attribute`} />
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
 * the focused name editor directly.
 */
export const VariablePill = ({
  animated = false,
  editable = false,
  label,
  maxWidth,
  minWidth,
  onLabelChange,
  type,
  validateLabel,
  width,
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

  const style = getVariablePillStyle(type, { width, minWidth, maxWidth });
  const editorFrame = useMemo(() => {
    if (!editorAnchor) {
      return null;
    }

    const availableWidth = window.innerWidth - EDITOR_FRAME_GUTTER;
    const targetPillWidth = Math.max(
      editorAnchor.width,
      Math.min(
        editorAnchor.maxWidth,
        (availableWidth - EDITOR_FRAME_PADDING * 2) / EDIT_MODE_SCALE,
      ),
    );
    const frameWidth = Math.min(
      availableWidth,
      Math.max(
        EDITOR_FRAME_MIN_WIDTH,
        targetPillWidth * EDIT_MODE_SCALE + EDITOR_FRAME_PADDING * 2,
      ),
    );

    return {
      targetPillWidth,
      style: {
        left: editorAnchor.left + editorAnchor.width / 2 - frameWidth / 2,
        top: editorAnchor.top - EDITOR_FRAME_PADDING,
        width: frameWidth,
      } satisfies React.CSSProperties,
      pillStyle: {
        ...style,
        '--variable-pill-width': `${targetPillWidth}px`,
        '--variable-pill-min-width': `${editorAnchor.width}px`,
        '--variable-pill-max-width': `${targetPillWidth}px`,
      } satisfies VariablePillStyle,
    };
  }, [editorAnchor, style]);

  if (!editable) {
    return (
      <data
        value={label}
        className={getVariablePillClassName({
          animated,
          fluid: width === '100%',
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
                fluid: width === '100%',
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
                reduceMotion ? false : { scale: 1, width: editorAnchor?.width }
              }
              animate={{
                scale: reduceMotion ? 1 : EDIT_MODE_SCALE,
                width: editorFrame.targetPillWidth,
              }}
              exit={{
                scale: 1,
                width: editorAnchor?.width,
              }}
              transition={
                reduceMotion ? { duration: 0 } : EDIT_MODE_LAYOUT_SPRING
              }
              className={getVariablePillClassName({
                animated: false,
              })}
              style={editorFrame.pillStyle}
            >
              <VariablePillContents type={type}>
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
              <div className="[&>div]:bg-destructive! [&>div]:text-destructive-contrast! [&>div]:px-4 [&>div]:py-2">
                <FieldErrors
                  id={validationId}
                  name="variable-name"
                  errors={[validation]}
                  show
                />
              </div>
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
  editable = false,
  maxWidth,
  minWidth,
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
      maxWidth={maxWidth}
      minWidth={minWidth}
      type={type}
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
