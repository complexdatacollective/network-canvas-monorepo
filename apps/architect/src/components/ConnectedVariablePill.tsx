import { get } from 'es-toolkit/compat';
import { Check, Dices, Pencil, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  type ComponentProps,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Button, { IconButton } from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import { Popover, PopoverContent } from '@codaco/fresco-ui/Popover';
import type { Variable } from '@codaco/protocol-validation';
import SyntheticDataEditor from '~/components/VariableEditor/SyntheticDataEditor';
import { getColorForType, getIconForType } from '~/config/variables';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableByUUID } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';
import { getVariablesForSubject } from '~/selectors/codebook';
import { cx } from '~/utils/cva';
import { validations } from '~/utils/validations';

import { VariableDistributionIcon } from './VariableDistributionIcon';
import { getActiveValidationNames, VariablePill } from './VariablePill';
import { getVariableSyntheticStatus } from './variableSyntheticMetadata';

const DARK_COLOR_SUFFIX = '-dark';
const SUMMARY_CLOSE_DELAY = 100;
const EDITOR_TOP = 24;
const INTERACTION_SCALE = 1.15;
const RENAME_SCREEN_MARGIN = 24;
const LAYOUT_SPRING = {
  type: 'spring',
  stiffness: 185,
  damping: 25,
  mass: 1.55,
} as const;
const ACTIVE_SPRING = {
  type: 'spring',
  stiffness: 300,
  damping: 28,
  mass: 1,
} as const;

type PopoverOpenChange = NonNullable<
  ComponentProps<typeof Popover>['onOpenChange']
>;

type EditorOrigin = {
  x: number;
  y: number;
};

type RenameFrame = {
  centerX: number;
  centerY: number;
  width: number;
};

type AccentStyle = CSSProperties & {
  '--variable-pill-accent': string;
};

const getRawColorToken = (color: string) =>
  color.endsWith(DARK_COLOR_SUFFIX)
    ? `${color.slice(0, -DARK_COLOR_SUFFIX.length)}--dark`
    : color;

function RenameVariablePill({
  error,
  label,
  onCancel,
  onChange,
  onConfirm,
  onRequiredWidth,
  type,
  width,
}: {
  error?: string;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onRequiredWidth: (width: number) => void;
  type: Variable['type'];
  width: number;
}) {
  const errorId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const accentColor = getRawColorToken(getColorForType(type));
  const style: AccentStyle = {
    '--variable-pill-accent': `oklch(var(--${accentColor}))`,
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm();
  };

  useLayoutEffect(() => {
    const form = formRef.current;
    const input = inputRef.current;
    if (!form || !input) return;

    const clippedLabelWidth = Math.max(
      0,
      input.scrollWidth - input.clientWidth,
    );
    if (clippedLabelWidth > 0) {
      onRequiredWidth(Math.ceil(form.offsetWidth + clippedLabelWidth));
    }
  }, [label, onRequiredWidth]);

  return (
    <motion.form
      ref={formRef}
      animate={{ scale: INTERACTION_SCALE, width }}
      className={cx(
        'variable-pill variable-pill-effect-border font-monospace effect-shadow flex min-h-12 max-w-full min-w-0 rounded p-0.5 text-base',
        error && 'outline-destructive outline-2',
      )}
      initial={false}
      onSubmit={handleSubmit}
      style={style}
      transition={ACTIVE_SPRING}
    >
      <span className="text-text bg-surface flex min-h-12 w-full min-w-0 items-stretch overflow-hidden rounded-[inherit]">
        <span className="flex w-12 shrink-0 items-center justify-center border-r border-white/25 bg-(--variable-pill-accent)">
          <img
            aria-hidden
            alt=""
            className="w-5 opacity-80"
            src={getIconForType(type)}
          />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 pl-4">
          <label className="sr-only" htmlFor={`${errorId}-name`}>
            Variable name
          </label>
          <input
            ref={inputRef}
            id={`${errorId}-name`}
            autoFocus
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            className="focusable bg-surface min-w-0 flex-1 border-0 px-1 py-1 outline-none"
            onChange={(event) => onChange(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancel();
              }
            }}
            value={label}
          />
          <IconButton
            aria-label="Cancel rename"
            icon={<X aria-hidden />}
            onClick={onCancel}
            size="sm"
            variant="text"
          />
          <IconButton
            aria-label="Confirm rename"
            color="success"
            icon={<Check aria-hidden />}
            size="sm"
            type="submit"
          />
        </span>
      </span>
      {error && (
        <span className="sr-only" id={errorId} role="alert">
          {error}
        </span>
      )}
    </motion.form>
  );
}

export type ConnectedVariablePillProps = {
  entity: 'node' | 'edge' | 'ego';
  type?: string;
  uuid: string;
};

export default function ConnectedVariablePill({
  entity,
  type,
  uuid,
}: ConnectedVariablePillProps) {
  const dispatch = useAppDispatch();
  const shouldReduceMotion = useReducedMotion();
  const pillAnchorRef = useRef<HTMLSpanElement>(null);
  const editorPillRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summarySuppressedRef = useRef(false);
  const editorFormId = useId();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameFrame, setRenameFrame] = useState<RenameFrame | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState<string>();
  const [editorOrigin, setEditorOrigin] = useState<EditorOrigin | null>(null);
  const [editorSettled, setEditorSettled] = useState(false);
  const [editorClosing, setEditorClosing] = useState(false);

  const subject = useMemo(() => ({ entity, type }), [entity, type]);
  const existingVariables = useAppSelector((state: RootState) =>
    getVariablesForSubject(state, subject),
  );
  const variable = (existingVariables?.[uuid] ?? null) as Variable | null;
  const existingVariableNames = useMemo(
    () =>
      Object.entries(existingVariables ?? {})
        .filter(([variableId]) => variableId !== uuid)
        .map(([, existingVariable]) => get(existingVariable, 'name')),
    [existingVariables, uuid],
  );

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const cancelScheduledClose = useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openSummary = useCallback(() => {
    cancelScheduledClose();
    if (!renaming && !editorOrigin && !summarySuppressedRef.current) {
      setSummaryOpen(true);
    }
  }, [cancelScheduledClose, editorOrigin, renaming]);

  const openSummaryFromPointer = useCallback(() => {
    summarySuppressedRef.current = false;
    openSummary();
  }, [openSummary]);

  const scheduleSummaryClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      summarySuppressedRef.current = true;
      setSummaryOpen(false);
      closeTimerRef.current = null;
    }, SUMMARY_CLOSE_DELAY);
  }, [cancelScheduledClose]);

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    scheduleSummaryClose();
  };

  const handlePillBlur = (event: FocusEvent<HTMLElement>) => {
    summarySuppressedRef.current = false;
    handleBlur(event);
  };

  const handleSummaryOpenChange: PopoverOpenChange = (open, eventDetails) => {
    if (open) return;
    // The pill is an external anchor rather than a PopoverTrigger, so Base UI
    // treats focus on it as leaving the popup. The component's paired blur
    // handlers already close after focus leaves both the pill and popup.
    if (eventDetails.reason === 'focus-out') {
      eventDetails.cancel();
      return;
    }
    summarySuppressedRef.current = true;
    cancelScheduledClose();
    setSummaryOpen(false);
  };

  const beginRename = () => {
    const anchor = pillAnchorRef.current;
    if (!variable || !anchor) return;
    const pill = anchor.querySelector('data');
    const rect = (pill ?? anchor).getBoundingClientRect();

    summarySuppressedRef.current = true;
    setSummaryOpen(false);
    setDraftName(variable.name);
    setRenameError(undefined);
    setRenameFrame({
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      width: rect.width / INTERACTION_SCALE,
    });
    setRenaming(true);
  };

  const cancelRename = () => {
    setRenaming(false);
    setRenameFrame(null);
    setRenameError(undefined);
  };

  const expandRenameFrame = useCallback((requiredWidth: number) => {
    setRenameFrame((current) => {
      if (!current) return current;

      const maximumWidth = Math.max(
        0,
        (window.innerWidth - RENAME_SCREEN_MARGIN * 2) / INTERACTION_SCALE,
      );
      const width = Math.min(
        Math.max(current.width, requiredWidth),
        maximumWidth,
      );
      const halfVisualWidth = (width * INTERACTION_SCALE) / 2;
      const minimumCenter = RENAME_SCREEN_MARGIN + halfVisualWidth;
      const maximumCenter =
        window.innerWidth - RENAME_SCREEN_MARGIN - halfVisualWidth;
      const centerX =
        minimumCenter > maximumCenter
          ? window.innerWidth / 2
          : Math.min(maximumCenter, Math.max(minimumCenter, current.centerX));

      if (width === current.width && centerX === current.centerX) {
        return current;
      }

      return { ...current, centerX, width };
    });
  }, []);

  const confirmRename = () => {
    if (!variable) return;
    const name = draftName.trim();
    const error =
      validations.required('You must enter a variable name')(name) ??
      validations.uniqueByList(existingVariableNames)(name) ??
      validations.allowedVariableName()(name);

    if (error) {
      setRenameError(error);
      return;
    }

    void dispatch(updateVariableByUUID(uuid, { name }, [], subject));
    cancelRename();
  };

  const beginSyntheticConfiguration = () => {
    const anchor = pillAnchorRef.current;
    if (!anchor) return;
    const pill = anchor.querySelector('data');
    const rect = (pill ?? anchor).getBoundingClientRect();
    summarySuppressedRef.current = true;
    setSummaryOpen(false);
    setEditorSettled(false);
    setEditorClosing(false);
    setEditorOrigin({
      x: rect.left + rect.width / 2 - window.innerWidth / 2,
      y: rect.top - EDITOR_TOP,
    });
  };

  const closeSyntheticConfiguration = useCallback(() => {
    if (!editorOrigin || editorClosing) return;
    setEditorSettled(false);
    setEditorClosing(true);
  }, [editorClosing, editorOrigin]);

  const handleEditorPillAnimationComplete = () => {
    if (editorClosing) {
      setEditorOrigin(null);
      setEditorClosing(false);
      return;
    }

    setEditorSettled(true);
  };

  if (!variable) return null;

  const validationNames = getActiveValidationNames(variable);
  const syntheticStatus = getVariableSyntheticStatus(variable);
  const configuring = editorOrigin !== null;

  return (
    <>
      <span
        ref={pillAnchorRef}
        className={cx(
          'relative inline-flex max-w-full',
          (configuring || renaming) && 'invisible',
        )}
        onBlur={handlePillBlur}
        onFocus={openSummary}
        onMouseEnter={openSummaryFromPointer}
        onMouseLeave={scheduleSummaryClose}
      >
        <VariablePill
          active={summaryOpen || renaming}
          interactive
          label={variable.name}
          type={variable.type}
          validations={validationNames}
        />
      </span>

      <Popover
        onOpenChange={handleSummaryOpenChange}
        open={summaryOpen && !renaming && !configuring}
      >
        <PopoverContent
          anchor={pillAnchorRef}
          align="center"
          className="w-[29rem] max-w-[calc(100vw-2rem)]"
          keepMounted={false}
          onBlur={handleBlur}
          onFocus={openSummary}
          onMouseEnter={openSummary}
          onMouseLeave={scheduleSummaryClose}
          side="bottom"
        >
          <div className="flex flex-col gap-5">
            <Surface noContainer shadow="none" spacing="xs">
              <div className="flex items-center gap-3">
                <div className="bg-surface-2 text-accent flex h-12 w-16 shrink-0 items-center justify-center rounded">
                  <VariableDistributionIcon shape={syntheticStatus.shape} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Synthetic data</p>
                  <p className="text-text-muted text-sm">
                    {syntheticStatus.label}
                  </p>
                </div>
              </div>
              {syntheticStatus.details.length > 0 && (
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                  {syntheticStatus.details.map((detail) => (
                    <div className="contents" key={detail.label}>
                      <dt className="text-text-muted">{detail.label}</dt>
                      <dd className="min-w-0 text-right wrap-break-word">
                        {detail.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Surface>
            <div className="flex flex-nowrap justify-end gap-2">
              <Button
                color="default"
                icon={<Pencil aria-hidden />}
                onClick={beginRename}
                size="sm"
                variant="default"
              >
                Rename
              </Button>
              <Button
                color="default"
                icon={<Dices aria-hidden />}
                onClick={beginSyntheticConfiguration}
                size="sm"
                variant="default"
              >
                Configure Synthetic Data
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Modal
        forceBackdrop
        onOpenChange={(open) => {
          if (!open) cancelRename();
        }}
        open={renaming && renameFrame !== null}
      >
        <ModalPopup
          aria-label={`Rename ${variable.name}`}
          animate={{ opacity: 1 }}
          className="pointer-events-none fixed inset-0 z-3000 outline-none"
          exit={{ opacity: 0.9999 }}
          initial={{ opacity: 0.9999 }}
        >
          {renameFrame && (
            <div
              className="pointer-events-auto fixed -translate-x-1/2 -translate-y-1/2"
              style={{
                left: renameFrame.centerX,
                top: renameFrame.centerY,
              }}
            >
              <RenameVariablePill
                error={renameError}
                label={draftName}
                onCancel={cancelRename}
                onChange={(value) => {
                  setDraftName(value);
                  setRenameError(undefined);
                }}
                onConfirm={confirmRename}
                onRequiredWidth={expandRenameFrame}
                type={variable.type}
                width={renameFrame.width}
              />
            </div>
          )}
        </ModalPopup>
      </Modal>

      <Modal
        forceBackdrop
        onOpenChange={(open) => {
          if (!open) closeSyntheticConfiguration();
        }}
        open={configuring}
      >
        <ModalPopup
          aria-label={`Configure synthetic data for ${variable.name}`}
          animate={{ opacity: 1 }}
          className="pointer-events-none fixed inset-0 z-3000 outline-none"
          exit={{ opacity: 0.9999 }}
          initial={{ opacity: 0.9999 }}
        >
          <div className="fixed top-6 left-1/2 -translate-x-1/2">
            <motion.div
              animate={
                editorClosing
                  ? {
                      x: editorOrigin?.x ?? 0,
                      y: editorOrigin?.y ?? 0,
                      scale: 1,
                    }
                  : { x: 0, y: 0, scale: 1 }
              }
              className="pointer-events-auto"
              initial={
                shouldReduceMotion
                  ? false
                  : {
                      x: editorOrigin?.x ?? 0,
                      y: editorOrigin?.y ?? 0,
                      scale: 1,
                    }
              }
              onAnimationComplete={handleEditorPillAnimationComplete}
              transition={shouldReduceMotion ? { duration: 0 } : LAYOUT_SPRING}
            >
              <span ref={editorPillRef} className="inline-flex">
                <VariablePill
                  interactive={false}
                  label={variable.name}
                  type={variable.type}
                  validations={validationNames}
                />
              </span>
            </motion.div>
          </div>

          <Popover open={editorSettled && !editorClosing}>
            <PopoverContent
              anchor={editorPillRef.current}
              align="center"
              className="pointer-events-auto max-h-(--available-height) w-[min(42rem,calc(100vw-2rem))] p-0"
              keepMounted={false}
              side="bottom"
              sideOffset={6}
            >
              <SyntheticDataEditor
                entity={entity}
                formId={editorFormId}
                onCancelled={closeSyntheticConfiguration}
                onSaved={closeSyntheticConfiguration}
                type={type}
                uuid={uuid}
              />
            </PopoverContent>
          </Popover>
        </ModalPopup>
      </Modal>
    </>
  );
}
