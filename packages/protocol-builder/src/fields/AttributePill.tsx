import { Check, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
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
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

/**
 * One attribute, shown as the researcher's name for it over the colour and
 * icon of the kind of answer it holds — and, where the mount allows it, the
 * control that renames it.
 *
 * The kind of answer decides what can be asked about an attribute and what a
 * rule can compare it against, so a picker offering three dozen of them is
 * unreadable without it: a researcher scanning for the rating they authored
 * months ago is looking for an ordinal, and the name alone does not say which
 * names are ordinals.
 *
 * This is Architect's own pill — the shape, the two-track grid, the accent
 * ring around a surface-coloured body, the nine type icons it has drawn
 * attributes with since its codebook editor was written, and the name editor
 * the pill itself opens — so that a researcher moving between Architect's
 * remaining screens and this package's editors reads one vocabulary rather
 * than two dialects of it.
 *
 * Presentational in both of its states: it is handed the name, told whether it
 * may be renamed, judges only that a name was typed at all, and answers with
 * the name the researcher typed. Which codebook the attribute lives in,
 * whether the write landed, and what to say when it did not are the caller's,
 * because the caller is what knows them.
 *
 * In this package rather than in `@codaco/fresco-ui`, even though the colours
 * it uses are shared theme tokens: what is protocol-specific is the MAPPING —
 * `VariableType` is the protocol schema's vocabulary, and fresco-ui neither
 * depends on `@codaco/protocol-validation` nor should start to for a control
 * only protocol authoring has.
 *
 * Deliberately says nothing to a screen reader about the type: where this
 * renders inside a `role="option"`, that row's accessible NAME has to be the
 * attribute's own name, and content inside it is part of that name. The kind
 * of answer is announced by whoever renders the pill — the picker states it
 * beside the held value, the spotlight describes each row with it — so this
 * cannot decide for both. That is the one place it parts company with
 * Architect's pill, whose icon carried an `alt` of "<type> attribute".
 */
export type AttributePillProps = Readonly<{
  /** The researcher's own name for the attribute. Never translated. */
  name: string;
  /**
   * The kind of answer it holds. Absent for a row that stands for something
   * other than a codebook attribute — the form-fields list's create sentinel —
   * which takes Architect's own fallback: the charcoal accent and the
   * question-mark mark, neither of which claims one of the nine kinds.
   */
  type?: VariableType;
  /**
   * Whether the codebook no longer describes this attribute.
   *
   * A rule that names one still has to read it back — the researcher cannot
   * repair what the editor will not show them — so the pill is drawn, in the
   * destructive accent rather than the neutral one an unknown kind takes: not
   * knowing the kind of answer and the attribute being gone are different
   * facts, and only the second is something to fix. The words for it are the
   * caller's, because the caller knows what it is a missing attribute OF.
   */
  missing?: boolean;
  /**
   * Whether pressing the pill opens the editor for the attribute's name.
   *
   * Opt-in per mount, exactly as it is in Architect: a pill that stands for a
   * reference — a row of the list being chosen from, an attribute named inside
   * the sentence of a rule, the fallback for one the codebook has lost — is a
   * statement rather than a control, and offering to rename from it would put
   * a codebook write behind a press the researcher made in order to read
   * something.
   */
  editable?: boolean;
  /**
   * Renames the attribute to the name the researcher typed.
   *
   * Answers nothing, because by the time a codebook write has landed this
   * editor has closed: what is left to say about a refusal belongs on the
   * surface the pill sits in rather than in a window that is no longer there.
   */
  onRename?: (name: string) => void;
  /**
   * Why the typed name cannot be used, or `undefined` while it can.
   *
   * The caller's, because both rules it covers are: which attributes count as
   * already having the name, and what the codebook will accept as one. Asked
   * only once a name has been typed, so an empty box reads as the question it
   * is rather than as a complaint about the characters in it.
   */
  validateName?: (name: string) => string | undefined;
  className?: string;
}>;

const messages = defineMessages({
  renameTrigger: {
    id: 'protocolBuilder.variablePicker.renameTrigger',
    defaultMessage: 'Edit attribute name: {label}',
    description:
      'Accessible name and tooltip of the attribute pill at a site where pressing it opens the editor for that attribute’s name. label is the researcher’s own name for the attribute, from the protocol’s codebook, and is not translated.',
  },
  renameDialogName: {
    id: 'protocolBuilder.variablePicker.renameDialogName',
    defaultMessage: 'Edit attribute name',
    description:
      'Accessible name of the small window that opens over the attribute pill for renaming that attribute.',
  },
  renameFieldLabel: {
    id: 'protocolBuilder.variablePicker.renameFieldLabel',
    defaultMessage: 'Attribute name',
    description:
      'Accessible name of the one box in the attribute rename window, which holds the attribute’s name.',
  },
  renamePlaceholder: {
    id: 'protocolBuilder.variablePicker.renamePlaceholder',
    defaultMessage: 'Enter an attribute name...',
    description:
      'Placeholder in the attribute rename window’s box, shown while the researcher has cleared the name.',
  },
  renameSubmit: {
    id: 'protocolBuilder.variablePicker.renameSubmit',
    defaultMessage: 'Save Changes',
    description:
      'Button of the attribute rename window that renames the attribute to the name typed there.',
  },
  renameRequired: {
    id: 'protocolBuilder.variablePicker.renameRequired',
    defaultMessage: 'You must enter an attribute name',
    description:
      'Refusal shown under the box of the attribute rename window while the researcher has cleared the name. An attribute the protocol’s codebook holds always has one.',
  },
  renameEditing: {
    id: 'protocolBuilder.variablePicker.renameEditing',
    defaultMessage: 'Editing attribute {name}',
    description:
      'Said to a screen reader as the attribute rename window opens. name is the researcher’s own name for the attribute and is not translated.',
  },
  renameCancelled: {
    id: 'protocolBuilder.variablePicker.renameCancelled',
    defaultMessage: 'Attribute name edit cancelled',
    description:
      'Said to a screen reader when the researcher leaves the attribute rename window without renaming anything.',
  },
  renamed: {
    id: 'protocolBuilder.variablePicker.renamed',
    defaultMessage: 'Attribute renamed to {name}',
    description:
      'Said to a screen reader once the researcher has renamed the attribute. name is the name they typed and is not translated.',
  },
});

/**
 * Where each type's icon is served from.
 *
 * `new URL(specifier, import.meta.url)` rather than an `import` of the file,
 * because this package's source is compiled inside each consumer's own
 * program: an `import` of a `.svg` needs an ambient module declaration the
 * consumer's TypeScript program would have to supply, while this form is a
 * plain string expression every bundler in the workspace already rewrites.
 * The same reason fresco-ui reaches its own assets this way.
 */
const ICON_URLS = {
  boolean: new URL('./icons/boolean-variable.svg', import.meta.url).href,
  categorical: new URL('./icons/categorical-variable.svg', import.meta.url)
    .href,
  datetime: new URL('./icons/date-variable.svg', import.meta.url).href,
  layout: new URL('./icons/layout-variable.svg', import.meta.url).href,
  location: new URL('./icons/location-variable.svg', import.meta.url).href,
  number: new URL('./icons/number-variable.svg', import.meta.url).href,
  ordinal: new URL('./icons/ordinal-variable.svg', import.meta.url).href,
  scalar: new URL('./icons/scalar-variable.svg', import.meta.url).href,
  text: new URL('./icons/text-variable.svg', import.meta.url).href,
} as const satisfies Record<VariableType, string>;

const DEFAULT_ICON_URL = new URL(
  './icons/default-variable.svg',
  import.meta.url,
).href;

/**
 * The accent each kind of answer is shown in, named as the theme's own raw
 * colour triplet rather than as a utility class: the accent is read twice, by
 * the ring around the pill and by the icon panel inside it, so it is set once
 * as a custom property on the root and referenced from both — which is also
 * how Architect's pill does it. A class assembled from a token at runtime
 * would be a class the stylesheet never contains.
 */
const ACCENT_TOKENS = {
  boolean: '--neon-carrot',
  categorical: '--mustard',
  datetime: '--tomato',
  layout: '--purple-pizazz',
  location: '--slate-blue--dark',
  number: '--paradise-pink',
  ordinal: '--sea-green',
  scalar: '--kiwi',
  text: '--cerulean-blue',
} as const satisfies Record<VariableType, string>;

/** Architect's fallback for anything that is not one of the nine. */
const DEFAULT_ACCENT_TOKEN = '--charcoal';

type AttributePillStyle = CSSProperties & {
  '--variable-pill-accent': string;
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

/** Where the editor opens, measured off the pill it opens over. */
type AttributePillEditorAnchor = Readonly<{
  left: number;
  maxWidth: number;
  top: number;
  width: number;
}>;

type Announcement = Readonly<{
  message: MessageDescriptor;
  values?: Readonly<{ name: string }>;
}>;

const pillStyleFor = (
  type: VariableType | undefined,
  missing: boolean,
): AttributePillStyle => ({
  // `--destructive` is already a colour rather than one of the theme's raw
  // triplets, so it is taken whole where the others are wrapped in `oklch`.
  '--variable-pill-accent': missing
    ? 'var(--destructive)'
    : `oklch(var(${type === undefined ? DEFAULT_ACCENT_TOKEN : ACCENT_TOKENS[type]}))`,
});

const pillClassName = ({
  className,
  interactive = false,
}: Readonly<{ className?: string; interactive?: boolean }> = {}) =>
  cx(
    // `variable-pill` is Architect's marker class, the hook its own same-area
    // cascades key on (the printable summary scales it, the rule preview zooms
    // it). `w-max` gives WebKit an explicit max-content basis; `w-fit`
    // collapsed to the ellipsis width in Safari instead of measuring the full
    // name.
    'variable-pill font-monospace inline-flex h-12 w-max max-w-full min-w-0 flex-nowrap rounded-full p-0.5 text-base',
    'effect-shadow-sm bg-(--variable-pill-accent)',
    !interactive && 'cursor-default',
    interactive &&
      'focusable hover:effect-shadow focus-visible:effect-shadow active:effect-shadow data-popup-open:effect-shadow cursor-pointer appearance-none border-0 text-left transition-[box-shadow,translate] duration-150 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 active:-translate-y-0.5 data-popup-open:-translate-y-0.5',
    className,
  );

/**
 * How wide the zoomed name editor may grow the pill to.
 *
 * The trigger's own `max-w-full` is a layout constraint of wherever it sits,
 * but the editor becomes a viewport overlay and must be able to grow beyond
 * that containing block. A concrete caller-provided `max-w-*` remains an
 * editor ceiling; the default percentage cap falls back to the internal
 * editing width.
 */
const resolvedMaximumWidth = (
  element: HTMLElement,
  currentWidth: number,
): number => {
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

/** The name's own cell of the pill, in both of the pill's states. */
const NAME_CLASS =
  'm-0 min-w-0 grow overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap';

function AttributePillContents({
  children,
  fill = false,
  iconUrl,
}: Readonly<{ children: ReactNode; fill?: boolean; iconUrl: string }>) {
  return (
    // A two-track grid gives WebKit a stable intrinsic width: the icon track
    // is fixed, while the name contributes its max-content width and may
    // still shrink to zero when the pill reaches its container or its max.
    <span
      className={cx(
        'text-text bg-surface grid h-full min-w-0 overflow-hidden rounded-[inherit]',
        fill
          ? 'w-full grid-cols-[3rem_minmax(0,1fr)]'
          : 'grid-cols-[3rem_minmax(0,auto)]',
      )}
    >
      <span className="flex items-center justify-center border-r border-white/25 bg-(--variable-pill-accent) [&_.icon]:w-5">
        <img className="icon opacity-80" src={iconUrl} alt="" />
      </span>
      <span className="flex min-w-0 items-center justify-between">
        {children}
      </span>
    </span>
  );
}

export default function AttributePill({
  name,
  type,
  missing = false,
  editable = false,
  onRename,
  validateName,
  className,
}: AttributePillProps) {
  const intl = useAppIntl();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  /**
   * Whether the editor is already on its way out.
   *
   * What makes closing idempotent, and the announcement is why that matters:
   * saving closes the editor, and `Modal` reports that close as
   * `onOpenChange(false)` — the same way Escape and an outside press arrive —
   * so without this a rename would announce itself and then announce that it
   * had been cancelled. A ref rather than state, because it is written and
   * read inside one event, before any re-render.
   */
  const closingRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const validationId = useId();

  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editorAnchor, setEditorAnchor] =
    useState<AttributePillEditorAnchor | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | undefined>(
    undefined,
  );
  const [newName, setNewName] = useState(name);

  const hasChanges = newName !== name;
  // Required first, then whatever the caller judges: an empty box is not a
  // name with the wrong characters in it, and told that it is, the researcher
  // goes looking for a character that is not there.
  const validation = !editing
    ? undefined
    : newName === ''
      ? intl.formatMessage(messages.renameRequired)
      : validateName?.(newName);
  const isValid = validation === undefined;

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      triggerRef.current?.focus();
      restoreFocusRef.current = false;
    }
  }, [editing]);

  // While the editor is closed the draft simply follows the committed name, so
  // a cancelled edit is discarded and a rename made elsewhere is picked up.
  // Both are values this render already has, so they are compared here rather
  // than synchronised from an effect.
  const [nameBaseline, setNameBaseline] = useState({ editing, name });
  if (nameBaseline.editing !== editing || nameBaseline.name !== name) {
    setNameBaseline({ editing, name });
    if (!editing) {
      setNewName(name);
    }
  }

  const style = useMemo(() => pillStyleFor(type, missing), [missing, type]);
  const iconUrl = type === undefined ? DEFAULT_ICON_URL : ICON_URLS[type];

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
      } satisfies CSSProperties,
      pillStyle: {
        ...style,
        width: `${targetPillWidth}px`,
        minWidth: `${Math.min(initialPillWidth, targetPillWidth)}px`,
        maxWidth: `${Math.max(initialPillWidth, targetPillWidth)}px`,
      } satisfies AttributePillStyle,
    };
  }, [editorAnchor, style]);

  const startEditing = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const triggerBounds = trigger.getBoundingClientRect();

    closingRef.current = false;
    setClosing(false);
    setEditorAnchor({
      left: triggerBounds.left,
      maxWidth: resolvedMaximumWidth(trigger, triggerBounds.width),
      top: triggerBounds.top,
      width: triggerBounds.width,
    });
    setNewName(name);
    setAnnouncement({ message: messages.renameEditing, values: { name } });
    restoreFocusRef.current = true;
    setEditing(true);
  };

  const closeEditor = ({
    announcement: nextAnnouncement,
    beforeClose,
  }: Readonly<{ announcement: Announcement; beforeClose?: () => void }>) => {
    if (closingRef.current) {
      return;
    }

    closingRef.current = true;
    setClosing(true);

    beforeClose?.();
    setEditing(false);
    setAnnouncement(nextAnnouncement);
  };

  const cancelEditing = () => {
    closeEditor({ announcement: { message: messages.renameCancelled } });
  };

  const completeEditing = () => {
    if (!isValid || !hasChanges || onRename === undefined) {
      return;
    }

    closeEditor({
      announcement: { message: messages.renamed, values: { name: newName } },
      beforeClose: () => onRename(newName),
    });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();

      if (isValid && hasChanges) {
        completeEditing();
      }
    }
  };

  /**
   * The pill's own statement of which attribute this is: the name a reader
   * looks it up by, and the kind of answer it holds.
   *
   * Rendered in both states and in the same shape, so that everything which
   * reads a pill — the window's own rows, the package's tests, the end-to-end
   * suite — finds the attribute in one place whether or not this mount offers
   * to rename it. In the editable state it is inside the button, whose own
   * accessible name says what pressing it does.
   */
  const statement = (
    <data value={name} data-attribute-type={type} className={NAME_CLASS}>
      {name}
    </data>
  );

  if (!editable) {
    return (
      <data
        value={name}
        // Read by tests and by the end-to-end suite as the row's own statement
        // of which kind of answer it holds: an accent is not something a test
        // can assert on without asserting a colour, which is a design decision
        // rather than behaviour.
        data-attribute-type={type}
        data-attribute-missing={missing ? '' : undefined}
        className={pillClassName({ className })}
        style={style}
      >
        <AttributePillContents iconUrl={iconUrl}>
          <span className={NAME_CLASS}>{name}</span>
        </AttributePillContents>
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
              aria-label={intl.formatMessage(messages.renameTrigger, {
                label: name,
              })}
              className={pillClassName({ className, interactive: true })}
              style={style}
              onClick={startEditing}
            >
              <AttributePillContents iconUrl={iconUrl}>
                {statement}
              </AttributePillContents>
            </button>
          }
        />
        <TooltipContent side="top">
          {intl.formatMessage(messages.renameTrigger, { label: name })}
        </TooltipContent>
      </Tooltip>

      <Modal
        open={editing}
        backdropClassName="z-30"
        onOpenChange={(open) => {
          if (!open) {
            cancelEditing();
          }
        }}
      >
        {editorFrame && (
          <ModalPopup
            key="attribute-pill-editor"
            aria-label={intl.formatMessage(messages.renameDialogName)}
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
              exit={{ scale: 1, width: editorFrame.initialPillWidth }}
              transition={
                reduceMotion ? { duration: 0 } : EDIT_MODE_LAYOUT_SPRING
              }
              className={pillClassName()}
              style={editorFrame.pillStyle}
            >
              <AttributePillContents fill iconUrl={iconUrl}>
                <InputField
                  autoFocus
                  aria-label={intl.formatMessage(messages.renameFieldLabel)}
                  aria-invalid={isValid ? undefined : true}
                  aria-describedby={isValid ? undefined : validationId}
                  className="h-full w-full rounded-l-none! outline-none!"
                  placeholder={intl.formatMessage(messages.renamePlaceholder)}
                  value={newName}
                  onChange={(value) => setNewName(value ?? '')}
                  onKeyDown={handleKeyDown}
                />
              </AttributePillContents>
            </motion.div>

            {validation !== undefined && (
              <FieldErrors
                id={validationId}
                name="attribute-name"
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
                onClick={cancelEditing}
              >
                {intl.formatMessage(commonMessages.cancel)}
              </Button>
              <Button
                size="sm"
                color="primary"
                icon={<Check aria-hidden />}
                disabled={closing || !isValid || !hasChanges}
                onClick={completeEditing}
              >
                {intl.formatMessage(messages.renameSubmit)}
              </Button>
            </motion.div>
          </ModalPopup>
        )}
      </Modal>

      {/* One region for all three sentences, always mounted and polite for
          each: a screen reader has to be watching a live region before its
          content appears, and none of the three interrupts anything — each is
          said about an act the researcher has just made. */}
      <span className="sr-only" aria-live="polite">
        {announcement && <AppMessage {...announcement} />}
      </span>
    </>
  );
}
