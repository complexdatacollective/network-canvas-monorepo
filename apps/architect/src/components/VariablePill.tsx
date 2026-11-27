import { Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import {
  variableNameRefusal,
  variableNameScope,
} from '@codaco/protocol-builder/fields/variableNameRules';
import {
  VariablePill as AttributeVariablePill,
  VariablePillBody,
  variablePillClassNames,
  variablePillKindOf as kindOf,
} from '@codaco/protocol-builder/fields/VariablePill';
import { normalizeCodebookName } from '@codaco/shared-consts';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableByUUID } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';
import {
  getVariablesForSubject,
  makeGetVariableWithEntity,
} from '~/selectors/codebook';
import { cx } from '~/utils/cva';
const messages = defineMessages({
  editAttributeName: {
    id: 'architect.variablePill.editAttributeName',
    defaultMessage: 'Edit attribute name: {label}',
    description:
      'Accessible name and tooltip of the pill button that opens the attribute rename editor. label is the current attribute name.',
  },
  enterAnAttributeName: {
    id: 'architect.variablePill.enterAnAttributeName',
    defaultMessage: 'Enter an attribute name...',
    description:
      'Placeholder shown in the empty text field of the attribute rename dialog.',
  },
  saveChanges: {
    id: 'architect.variablePill.saveChanges',
    defaultMessage: 'Save Changes',
    description:
      'Button in the attribute rename dialog that saves the new attribute name. Disabled until the name is valid and changed.',
  },
});
const finalMessages = defineMessages({
  required: {
    id: 'architect.final.components.VariablePill.required',
    defaultMessage: 'You must enter an attribute name',
    description:
      'Validation error in the attribute rename dialog when the name field is empty.',
  },
});

export type VariablePillProps = {
  className?: string;
  label: string;
  /**
   * The variable's type. The pill falls back to a neutral look for a type it
   * does not know, such as the empty type of a variable missing from the
   * codebook.
   */
  type: string;
  editable?: boolean;
  onLabelChange?: (label: string) => void;
  validateLabel?: (label: string) => string | null | undefined;
};

export type ConnectedVariablePillProps = Pick<
  VariablePillProps,
  'className' | 'editable'
> & {
  uuid: string;
};

type VariablePillEditorAnchor = {
  left: number;
  maxWidth: number;
  top: number;
  width: number;
};

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

/**
 * The pill's own classes, from protocol-builder's one pill, with the raised
 * affordance of a pill that opens the name editor.
 */
const getVariablePillClassName = ({
  type,
  className,
  interactive,
}: {
  type: string;
  className?: string;
  interactive?: boolean;
}) =>
  variablePillClassNames({
    kind: kindOf(type),
    className: cx(
      !interactive && 'cursor-default',
      interactive &&
        'focusable hover:effect-shadow focus-visible:effect-shadow active:effect-shadow data-popup-open:effect-shadow cursor-pointer appearance-none border-0 text-start transition-[box-shadow,translate] duration-150 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 active:-translate-y-0.5 data-popup-open:-translate-y-0.5',
      className,
    ),
  }).root;

/** The name inside a pill, in the classes of protocol-builder's one pill. */
const nameClassName = (type: string) =>
  variablePillClassNames({ kind: kindOf(type) }).name;

/**
 * A variable reference whose interaction and visual treatment are independent.
 * Static pills use `<data>` semantics; editable pills use a button that opens
 * the focused name editor directly.
 */
export const VariablePill = ({
  className,
  editable = false,
  label,
  onLabelChange,
  type,
  validateLabel,
}: VariablePillProps) => {
  const intl = useAppIntl();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const closingRef = useRef(false);
  const reduceMotion = usePrefersReducedMotion();
  const validationId = useId();

  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editorAnchor, setEditorAnchor] =
    useState<VariablePillEditorAnchor | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const [newName, setNewName] = useState(label);
  // What the rename would save: the draft as typed may carry padding or a
  // decomposed accent, which saving normalizes away.
  const savedName = normalizeCodebookName(newName);
  const hasChanges = savedName !== label;

  // A name that saves as nothing is missing, whatever whitespace was typed;
  // every other rule a name answers to is the caller's (`validateLabel`).
  const getValidation = (value: string) =>
    normalizeCodebookName(value) === ''
      ? intl.formatMessage(finalMessages.required)
      : (validateLabel?.(value) ?? null);

  const validation = editing ? getValidation(savedName) : null;
  const isValid = !validation;

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      triggerRef.current?.focus();
      restoreFocusRef.current = false;
    }
  }, [editing]);

  // While the editor is closed the draft simply follows the committed label,
  // so a cancelled edit is discarded and a rename made elsewhere is picked up.
  // Both are values this render already has, so they are compared here rather
  // than synchronised from an effect.
  const [nameBaseline, setNameBaseline] = useState({ editing, label });
  if (nameBaseline.editing !== editing || nameBaseline.label !== label) {
    setNameBaseline({ editing, label });
    if (!editing) {
      setNewName(label);
    }
  }

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
      announcement: `Attribute renamed to ${savedName}`,
      beforeClose: () => onLabelChange(savedName),
    });
  };

  const handleUpdateName = (value: string | undefined) => {
    const nextValue = value ?? '';
    setNewName(nextValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();

      if (isValid && hasChanges) {
        onEditComplete();
      }
    }
  };

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
        width: `${targetPillWidth}px`,
        minWidth: `${Math.min(initialPillWidth, targetPillWidth)}px`,
        maxWidth: `${Math.max(initialPillWidth, targetPillWidth)}px`,
      } satisfies React.CSSProperties,
    };
  }, [editorAnchor]);

  if (!editable) {
    return (
      <AttributeVariablePill
        name={label}
        {...(kindOf(type) === undefined ? {} : { kind: kindOf(type) })}
        className={cx('cursor-default', className)}
        // The table or summary that lists the pill states the type in words;
        // a screen reader is told it here as well, as Architect always has.
        describeKind
      />
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
              aria-label={intl.formatMessage(messages.editAttributeName, {
                label: label,
              })}
              className={getVariablePillClassName({
                type,
                className,
                interactive: true,
              })}
              onClick={handleStartEditing}
              // As protocol-builder's pill says of its root: the kind of
              // value it stands for, which its accent shows.
              {...(kindOf(type) === undefined
                ? {}
                : { 'data-attribute-type': kindOf(type) })}
            >
              <VariablePillBody kind={kindOf(type)}>
                {/* oxlint-disable-next-line direction/typed-text-matches-parent -- the name class from `variablePillClassNames` contains `text-match-parent` */}
                <span dir="auto" className={nameClassName(type)}>
                  {label}
                </span>
              </VariablePillBody>
            </button>
          }
        />
        <TooltipContent side="top">
          {intl.formatMessage(messages.editAttributeName, { label: label })}
        </TooltipContent>
      </Tooltip>

      <Modal
        open={editing}
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
              className={getVariablePillClassName({ type })}
              style={editorFrame.pillStyle}
            >
              <VariablePillBody fill kind={kindOf(type)}>
                <InputField
                  autoFocus
                  aria-label="Attribute name"
                  aria-invalid={validation ? true : undefined}
                  aria-describedby={validation ? validationId : undefined}
                  className="h-full w-full rounded-s-none! outline-none!"
                  placeholder={intl.formatMessage(
                    messages.enterAnAttributeName,
                  )}
                  value={newName}
                  onChange={handleUpdateName}
                  onKeyDown={handleKeyDown}
                />
              </VariablePillBody>
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
                {intl.formatMessage(commonMessages.cancel)}
              </Button>
              <Button
                size="sm"
                color="primary"
                icon={<Check aria-hidden />}
                disabled={closing || !isValid || !hasChanges}
                onClick={onEditComplete}
              >
                {intl.formatMessage(messages.saveChanges)}
              </Button>
            </motion.div>
          </ModalPopup>
        )}
      </Modal>

      <span className="sr-only" aria-live="polite" lang="en">
        {announcement}
      </span>
    </>
  );
};

const ConnectedVariablePillComponent = ({
  className,
  editable = false,
  uuid,
}: ConnectedVariablePillProps) => {
  const intl = useAppIntl();
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

  // The rule protocol-builder's attribute editors ask of a name — taken,
  // unstorable, or clashing with an export column — so a rename here and one
  // in a stage editor are refused for the same reasons in the same words.
  const nameScope = useMemo(
    () => variableNameScope(entity ?? 'node', existingVariables ?? {}),
    [entity, existingVariables],
  );

  if (!type) {
    return null;
  }

  return (
    <VariablePill
      className={className}
      editable={editable}
      label={name ?? ''}
      type={type}
      onLabelChange={(nextName) => {
        const action = updateVariableByUUID(uuid, { name: nextName });
        void dispatch(action);
      }}
      validateLabel={(nextName) =>
        variableNameRefusal(nextName, {
          intl,
          scope: nameScope,
          // Self-excluded by record id, so a change of case is not refused as
          // a name already taken, and the attribute's own columns do not stand
          // in the way of the ones its new name would write.
          excluding: uuid,
        })
      }
    />
  );
};

export const ConnectedVariablePill = React.memo(ConnectedVariablePillComponent);
