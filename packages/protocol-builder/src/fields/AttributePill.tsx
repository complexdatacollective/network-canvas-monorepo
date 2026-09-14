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
import { Button } from '@codaco/fresco-ui/Button';
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

const messages = defineMessages({
  renameTrigger: {
    id: 'protocolBuilder.variablePicker.renameTrigger',
    defaultMessage: 'Edit attribute name: {label}',
    description:
      'Accessible name and tooltip of the attribute pill when pressing it opens the editor for the attribute’s name. label is the researcher’s own name for it and is not translated.',
  },
  renameDialogName: {
    id: 'protocolBuilder.variablePicker.renameDialogName',
    defaultMessage: 'Edit attribute name',
    description:
      'Accessible name of the small editor that opens over the attribute pill for renaming the attribute.',
  },
  renameFieldLabel: {
    id: 'protocolBuilder.variablePicker.renameFieldLabel',
    defaultMessage: 'Attribute name',
    description:
      'Accessible name of the box the attribute’s new name is typed into.',
  },
  renamePlaceholder: {
    id: 'protocolBuilder.variablePicker.renamePlaceholder',
    defaultMessage: 'Enter an attribute name...',
    description:
      'Placeholder in the box the attribute’s new name is typed into, shown while it is empty.',
  },
  renameSubmit: {
    id: 'protocolBuilder.variablePicker.renameSubmit',
    defaultMessage: 'Save Changes',
    description: 'Button that writes the attribute’s new name.',
  },
  renameEditing: {
    id: 'protocolBuilder.variablePicker.renameEditing',
    defaultMessage: 'Editing attribute {name}',
    description:
      'Said aloud when the editor for an attribute’s name opens. name is the researcher’s own name for it and is not translated.',
  },
  renameCancelled: {
    id: 'protocolBuilder.variablePicker.renameCancelled',
    defaultMessage: 'Attribute name edit cancelled',
    description:
      'Said aloud when the researcher leaves the attribute-name editor without saving.',
  },
  renamed: {
    id: 'protocolBuilder.variablePicker.renamed',
    defaultMessage: 'Attribute renamed to {name}',
    description:
      'Said aloud once an attribute has been renamed. name is the researcher’s own new name for it and is not translated.',
  },
  renameRequired: {
    id: 'protocolBuilder.variablePicker.renameRequired',
    defaultMessage: 'You must enter an attribute name',
    description:
      'Refusal shown in the attribute-name editor when the box has been emptied. An attribute must be called something.',
  },
});

/** How much bigger the pill is drawn while its name is being typed. */
const EDIT_MODE_SCALE = 1.5;
const EDITOR_FRAME_GUTTER = 32;
const EDITOR_FRAME_MIN_WIDTH = 320;
const EDITOR_FRAME_PADDING = 24;
const DEFAULT_EDITOR_MAX_WIDTH_REM = 20;
const EDIT_MODE_LAYOUT_SPRING = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 1.2,
} as const;

type EditorAnchor = Readonly<{
  left: number;
  maxWidth: number;
  top: number;
  width: number;
}>;

/**
 * How wide the zoomed name editor may grow the pill to.
 *
 * The trigger's own `max-w-full` is a layout constraint of wherever it sits,
 * but the editor is a viewport overlay and has to be able to grow past that
 * containing block. A concrete `max-w-*` a caller set stays a ceiling; the
 * default percentage cap falls back to the editor's own width.
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

/**
 * One attribute, shown as the researcher's name for it over the colour and
 * icon of the kind of answer it holds.
 *
 * The kind of answer decides what can be asked about an attribute and what a
 * rule can compare it against, so a picker offering three dozen of them is
 * unreadable without it: a researcher scanning for the rating they authored
 * months ago is looking for an ordinal, and the name alone does not say which
 * names are ordinals.
 *
 * This is Architect's own pill — the shape, the two-track grid, the accent
 * ring around a surface-coloured body, and the nine type icons it has drawn
 * attributes with since its codebook editor was written — so that a researcher
 * moving between Architect's remaining screens and this package's editors
 * reads one vocabulary rather than two dialects of it.
 *
 * In this package rather than in `@codaco/fresco-ui`, even though the colours
 * it uses are shared theme tokens: what is protocol-specific is the MAPPING —
 * `VariableType` is the protocol schema's vocabulary, and fresco-ui neither
 * depends on `@codaco/protocol-validation` nor should start to for a control
 * only protocol authoring has.
 *
 * Purely presentational, and deliberately says nothing to a screen reader
 * about the type: where this renders inside a `role="option"`, that row's
 * accessible NAME has to be the attribute's own name, and content inside it is
 * part of that name. The kind of answer is announced by whoever renders the
 * pill — the picker states it beside the held value, the spotlight describes
 * each row with it — so this cannot decide for both. That is the one place it
 * parts company with Architect's pill, whose icon carried an `alt` of
 * "<type> attribute".
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
   * Off by default, and turned on at exactly one mount — the attribute a
   * picker is holding — because that is the one place Architect turned it on
   * (`VariablePicker.tsx`'s held typed value). A pill that stands for
   * something read-only, or for an attribute that is not there, is a
   * statement rather than a control.
   */
  editable?: boolean;
  /**
   * Writes the new name, and says what went wrong if the write is refused.
   *
   * Awaited, because the write is a codebook write of its own: the attribute
   * lives in another section of the protocol, so renaming it takes that
   * section's lock and can be refused by somebody else holding it. A refusal
   * belongs to the caller's own surface — the picker says it in its notice
   * region — so what comes back here is only whether the editor may close.
   */
  onRename?: (name: string) => Promise<boolean> | boolean;
  /**
   * What is wrong with the typed name beyond its being empty, or `undefined`
   * while it is fine — the uniqueness rule and the character rule, which the
   * caller owns because only it knows which attributes are in scope.
   */
  validateName?: (name: string) => string | undefined;
  className?: string;
}>;

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

/** The pill's own shape, drawn the same whether it is a statement or a button. */
const pillClassName = ({
  interactive = false,
  className,
}: Readonly<{ interactive?: boolean; className?: string }>): string =>
  cx(
    // `variable-pill` is Architect's marker class, the hook its own same-area
    // cascades key on (the printable summary scales it, the rule preview zooms
    // it). `w-max` gives WebKit an explicit max-content basis; `w-fit`
    // collapsed to the ellipsis width in Safari instead of measuring the full
    // name.
    'variable-pill font-monospace inline-flex h-12 w-max max-w-full min-w-0 flex-nowrap rounded-full p-0.5 text-base',
    'effect-shadow-sm bg-(--variable-pill-accent)',
    interactive
      ? 'focusable hover:effect-shadow focus-visible:effect-shadow active:effect-shadow data-popup-open:effect-shadow cursor-pointer appearance-none border-0 text-left transition-[box-shadow,translate] duration-150 ease-out hover:-translate-y-0.5 focus-visible:-translate-y-0.5 active:-translate-y-0.5 data-popup-open:-translate-y-0.5'
      : 'cursor-default',
    className,
  );

/**
 * The accent panel and the name, which both the statement and the editor draw.
 *
 * `fill` is the editor's: the pill grows to the frame it is drawn in, so the
 * name track takes the rest of the width rather than its own content's.
 */
function PillContents({
  iconUrl,
  fill = false,
  children,
}: Readonly<{ iconUrl: string; fill?: boolean; children: ReactNode }>) {
  return (
    /*
      A two-track grid gives WebKit a stable intrinsic width: the icon track
      is fixed, while the name contributes its max-content width and may
      still shrink to zero when the pill reaches its container or its max.
    */
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

const NAME_CLASSES =
  'm-0 min-w-0 grow overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap';

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
  /** Whether the pill is the element focus belongs to once the editor closes. */
  const restoreFocusRef = useRef(false);
  /**
   * Whether this editor has already begun closing.
   *
   * A close is one act however it was asked for, and both the save and the
   * dismissal below ask for it: without this a save's own close would be
   * answered by the Modal's dismissal too, and the researcher would be told
   * the attribute was renamed and then that the edit was cancelled.
   */
  const closingRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const validationId = useId();

  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editorAnchor, setEditorAnchor] = useState<EditorAnchor | null>(null);
  const [announcement, setAnnouncement] = useState<Readonly<{
    message: MessageDescriptor;
    values?: Readonly<{ name: string }>;
  }> | null>(null);
  const [draftName, setDraftName] = useState(name);

  const hasChanges = draftName !== name;
  // Required first, then whatever the caller's own rules say: a researcher who
  // has emptied the box is told to write something rather than that nothing is
  // a name already taken. Architect asked them in this order too.
  const validation =
    editing && draftName.trim() === ''
      ? intl.formatMessage(messages.renameRequired)
      : editing
        ? validateName?.(draftName)
        : undefined;
  const isValid = validation === undefined;

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      triggerRef.current?.focus();
      restoreFocusRef.current = false;
    }
  }, [editing]);

  // While the editor is closed the draft simply follows the name the codebook
  // holds, so a cancelled edit is discarded and a rename made elsewhere is
  // picked up. Both are values this render already has, so they are compared
  // here rather than synchronised from an effect.
  const [nameBaseline, setNameBaseline] = useState({ editing, name });
  if (nameBaseline.editing !== editing || nameBaseline.name !== name) {
    setNameBaseline({ editing, name });
    if (!editing) setDraftName(name);
  }

  const accentToken =
    type === undefined ? DEFAULT_ACCENT_TOKEN : ACCENT_TOKENS[type];
  const iconUrl = type === undefined ? DEFAULT_ICON_URL : ICON_URLS[type];
  const style: AttributePillStyle = {
    // `--destructive` is already a colour rather than one of the theme's raw
    // triplets, so it is taken whole where the others are wrapped in `oklch`.
    '--variable-pill-accent': missing
      ? 'var(--destructive)'
      : `oklch(var(${accentToken}))`,
  };

  const startEditing = () => {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    const bounds = trigger.getBoundingClientRect();

    closingRef.current = false;
    setClosing(false);
    setEditorAnchor({
      left: bounds.left,
      maxWidth: resolvedMaximumWidth(trigger, bounds.width),
      top: bounds.top,
      width: bounds.width,
    });
    setDraftName(name);
    setAnnouncement({
      message: messages.renameEditing,
      values: { name },
    });
    restoreFocusRef.current = true;
    setEditing(true);
  };

  const closeEditor = (
    next: Readonly<{
      message: MessageDescriptor;
      values?: Readonly<{ name: string }>;
    }>,
  ) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setEditing(false);
    setAnnouncement(next);
  };

  const cancel = () => {
    closeEditor({ message: messages.renameCancelled });
  };

  const commit = () => {
    if (!isValid || !hasChanges || onRename === undefined) return;
    // The write is asked for BEFORE the editor closes, and the editor closes
    // only if it was taken: a refusal — somebody else holding the codebook
    // section, a name they have just taken — leaves the researcher looking at
    // what they typed, which is the thing there is to change.
    void Promise.resolve(onRename(draftName)).then((taken) => {
      if (taken) {
        closeEditor({
          message: messages.renamed,
          values: { name: draftName },
        });
      } else {
        setClosing(false);
      }
    });
    setClosing(true);
  };

  /**
   * Enter is the keyboard's Save.
   *
   * It asks `commit` rather than repeating what `commit` will decide: whether
   * there is anything to save is one rule, and a copy of it here was a copy
   * nothing could tell apart from the original — either one could be wrong on
   * its own and the other would cover for it.
   */
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commit();
  };

  const editorFrame = useMemo(() => {
    if (editorAnchor === null) return null;

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
    // `style` is derived from the props above and rebuilt on every render; the
    // frame only has to follow the anchor it was measured against.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [editorAnchor]);

  if (!editable || onRename === undefined) {
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
        <PillContents iconUrl={iconUrl}>
          <span className={NAME_CLASSES}>{name}</span>
        </PillContents>
      </data>
    );
  }

  const triggerLabel = intl.formatMessage(messages.renameTrigger, {
    label: name,
  });

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-label={triggerLabel}
              className={pillClassName({ interactive: true, className })}
              style={style}
              onClick={startEditing}
            >
              <PillContents iconUrl={iconUrl}>
                {/*
                  The same `<data>` the statement above is, inside the button
                  rather than around it: it is where every reader of a pill
                  finds which attribute this is — the package's own tests, and
                  the end-to-end suite's reading of what a field holds
                  (`e2e/pageobjects/editor-sections/variables.ts`) — and a
                  mount that offered a rename must not be a mount where that
                  reading finds nothing. It contributes nothing to the
                  button's accessible name, which `aria-label` has already
                  settled.
                */}
                <data
                  value={name}
                  data-attribute-type={type}
                  className={NAME_CLASSES}
                >
                  {name}
                </data>
              </PillContents>
            </button>
          }
        />
        <TooltipContent side="top">{triggerLabel}</TooltipContent>
      </Tooltip>

      <Modal
        open={editing}
        backdropClassName="z-30"
        onOpenChange={(open) => {
          if (!open) cancel();
        }}
      >
        {editorFrame !== null && (
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
              className={pillClassName({})}
              style={editorFrame.pillStyle}
            >
              <PillContents iconUrl={iconUrl} fill>
                <InputField
                  autoFocus
                  aria-label={intl.formatMessage(messages.renameFieldLabel)}
                  aria-invalid={isValid ? undefined : true}
                  aria-describedby={isValid ? undefined : validationId}
                  className="h-full w-full rounded-l-none! outline-none!"
                  placeholder={intl.formatMessage(messages.renamePlaceholder)}
                  value={draftName}
                  onChange={(value: string | undefined) =>
                    setDraftName(value ?? '')
                  }
                  onKeyDown={handleKeyDown}
                />
              </PillContents>
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
                icon={<X aria-hidden />}
                disabled={closing}
                onClick={cancel}
              >
                {intl.formatMessage(commonMessages.cancel)}
              </Button>
              <Button
                size="sm"
                color="primary"
                icon={<Check aria-hidden />}
                disabled={closing || !isValid || !hasChanges}
                onClick={commit}
              >
                {intl.formatMessage(messages.renameSubmit)}
              </Button>
            </motion.div>
          </ModalPopup>
        )}
      </Modal>

      {/* One region for all three sentences, always mounted: a live region
          added to the page at the same moment as its own content is not
          reliably announced. */}
      <span className="sr-only" aria-live="polite">
        {announcement !== null && <AppMessage {...announcement} />}
      </span>
    </>
  );
}
