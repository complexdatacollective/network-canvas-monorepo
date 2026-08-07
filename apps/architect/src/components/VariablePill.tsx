import { motion, useReducedMotion } from 'motion/react';
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import {
  ArrowSvg,
  BaseUISharedPopoverContainer,
} from '@codaco/fresco-ui/Popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import type { Variable, VariableType } from '@codaco/protocol-validation';
import { getColorForType, getIconForType } from '~/config/variables';
import { useAppSelector } from '~/ducks/hooks';
import {
  makeGetVariable,
  makeGetVariableWithEntity,
} from '~/selectors/codebook';
import { cx } from '~/utils/cva';

import { VariableDistributionIcon } from './VariableDistributionIcon';
import VariableEditor from './VariableEditor/VariableEditor';
import {
  getVariablePillMetadata,
  type VariablePillMetadata,
  type VariablePillStatus,
} from './variablePillMetadata';
import { VariableValidationIcon } from './VariableValidationIcon';

type VariablePillSizingProps = {
  width?: string;
  minWidth?: string;
  maxWidth?: string;
};

export type VariablePillProps = VariablePillSizingProps & {
  label: string;
  type: VariableType;
  /**
   * Full codebook configuration used to show validation and resolved
   * synthetic-generation metadata. Presentation-only references may omit it.
   */
  variable?: Variable;
  animated?: boolean;
  /**
   * Editing requires the codebook variable's uuid: the pill moves into a
   * modal editor containing the name, type-specific configuration, and
   * synthetic data, all saved atomically. Pills without a uuid render
   * statically.
   */
  editable?: boolean;
  uuid?: string;
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

const DARK_COLOR_SUFFIX = '-dark';
const DEFAULT_MIN_WIDTH = '12rem';
const DEFAULT_MAX_WIDTH = '20rem';
const DEFAULT_METADATA_MAX_WIDTH = '26rem';
const EDITOR_MAX_WIDTH = 42 * 16;
const EDITOR_NAME_FIELD_ALLOWANCE = 32;
const EDITOR_VIEWPORT_GUTTER = 16;
const EDITOR_TOP = 24;
const PILL_HORIZONTAL_INSET = 4;
const VALIDATION_GAP = 4;
const VALIDATION_ICON_WIDTH = 24;
const VARIABLE_PILL_MARKER = 'variable-pill';
const PILL_PREVIEW_EXPAND_TRANSITION = {
  type: 'tween',
  duration: 0.42,
  ease: [0.4, 0, 0.2, 1],
} as const;
const PILL_PREVIEW_CONTRACT_TRANSITION = {
  type: 'tween',
  duration: 0.36,
  ease: [0.4, 0, 0.2, 1],
} as const;
const PILL_EDITOR_SCALE = 1.25;
const PILL_EDITOR_LAYOUT_SPRING = {
  type: 'spring',
  stiffness: 80,
  damping: 19,
  mass: 1.65,
} as const;
// Keep every spatial property on the same physical spring. Deliberately omit
// duration, visualDuration, easing, and delay so Motion derives the timing
// entirely from the spring's stiffness, damping, and mass.
const PILL_EDITOR_LAYOUT_TRANSITION = {
  x: PILL_EDITOR_LAYOUT_SPRING,
  y: PILL_EDITOR_LAYOUT_SPRING,
  width: PILL_EDITOR_LAYOUT_SPRING,
  scale: PILL_EDITOR_LAYOUT_SPRING,
} as const;

type ValidationLayout = {
  fullClassName: string;
  minimumWidth: number;
  summaryClassName: string;
};

const getValidationLayout = (count: number): ValidationLayout => {
  if (count <= 1) {
    return {
      fullClassName: 'flex',
      minimumWidth: 0,
      summaryClassName: 'hidden',
    };
  }

  switch (count) {
    case 2:
      return {
        fullClassName: 'hidden @min-[20rem]:flex',
        minimumWidth: 20 * 16,
        summaryClassName: 'flex @min-[20rem]:hidden',
      };
    case 3:
      return {
        fullClassName: 'hidden @min-[22rem]:flex',
        minimumWidth: 22 * 16,
        summaryClassName: 'flex @min-[22rem]:hidden',
      };
    case 4:
      return {
        fullClassName: 'hidden @min-[24rem]:flex',
        minimumWidth: 24 * 16,
        summaryClassName: 'flex @min-[24rem]:hidden',
      };
    case 5:
      return {
        fullClassName: 'hidden @min-[26rem]:flex',
        minimumWidth: 26 * 16,
        summaryClassName: 'flex @min-[26rem]:hidden',
      };
    case 6:
      return {
        fullClassName: 'hidden @min-[28rem]:flex',
        minimumWidth: 28 * 16,
        summaryClassName: 'flex @min-[28rem]:hidden',
      };
    case 7:
      return {
        fullClassName: 'hidden @min-[30rem]:flex',
        minimumWidth: 30 * 16,
        summaryClassName: 'flex @min-[30rem]:hidden',
      };
    case 8:
      return {
        fullClassName: 'hidden @min-[32rem]:flex',
        minimumWidth: 32 * 16,
        summaryClassName: 'flex @min-[32rem]:hidden',
      };
    case 9:
      return {
        fullClassName: 'hidden @min-[34rem]:flex',
        minimumWidth: 34 * 16,
        summaryClassName: 'flex @min-[34rem]:hidden',
      };
    case 10:
      return {
        fullClassName: 'hidden @min-[36rem]:flex',
        minimumWidth: 36 * 16,
        summaryClassName: 'flex @min-[36rem]:hidden',
      };
    case 11:
      return {
        fullClassName: 'hidden @min-[38rem]:flex',
        minimumWidth: 38 * 16,
        summaryClassName: 'flex @min-[38rem]:hidden',
      };
    case 12:
      return {
        fullClassName: 'hidden @min-[40rem]:flex',
        minimumWidth: 40 * 16,
        summaryClassName: 'flex @min-[40rem]:hidden',
      };
    default:
      return {
        fullClassName: 'hidden @min-[42rem]:flex',
        minimumWidth: 42 * 16,
        summaryClassName: 'flex @min-[42rem]:hidden',
      };
  }
};

type PreviewLayout = {
  collapsedHeight: number;
  collapsedLeft: number;
  collapsedTop: number;
  collapsedWidth: number;
  expandedLeft: number;
  expandedWidth: number;
};

type EditorOrigin = {
  expandedWidth: number;
  left: number;
  top: number;
  width: number;
};

const getRawColorToken = (color: string) =>
  color.endsWith(DARK_COLOR_SUFFIX)
    ? `${color.slice(0, -DARK_COLOR_SUFFIX.length)}--dark`
    : color;

const getPreviewLayout = (
  rect: DOMRect,
  requiredExpansion: number,
): PreviewLayout => {
  const availableWidth = window.innerWidth - EDITOR_VIEWPORT_GUTTER * 2;
  const expandedWidth = Math.max(
    rect.width,
    Math.min(rect.width + requiredExpansion, availableWidth),
  );
  const centeredLeft = rect.left - (expandedWidth - rect.width) / 2;
  const maximumLeft = Math.max(
    EDITOR_VIEWPORT_GUTTER,
    window.innerWidth - expandedWidth - EDITOR_VIEWPORT_GUTTER,
  );
  const expandedLeft = Math.min(
    Math.max(EDITOR_VIEWPORT_GUTTER, centeredLeft),
    maximumLeft,
  );

  return {
    collapsedHeight: rect.height,
    collapsedLeft: rect.left,
    collapsedTop: rect.top,
    collapsedWidth: rect.width,
    expandedLeft,
    expandedWidth,
  };
};

const measureIntrinsicLabelWidth = (labelElement: HTMLElement): number => {
  const measurement = labelElement.cloneNode(true);
  if (!(measurement instanceof HTMLElement)) return labelElement.scrollWidth;
  const computedStyle = window.getComputedStyle(labelElement);
  measurement.removeAttribute('data-variable-pill-label');
  measurement.setAttribute('aria-hidden', 'true');
  Object.assign(measurement.style, {
    flex: 'none',
    fontFamily: computedStyle.fontFamily,
    fontSize: computedStyle.fontSize,
    fontStyle: computedStyle.fontStyle,
    fontWeight: computedStyle.fontWeight,
    inset: '0 auto auto 0',
    letterSpacing: computedStyle.letterSpacing,
    maxWidth: 'none',
    minWidth: '0',
    overflow: 'visible',
    pointerEvents: 'none',
    position: 'fixed',
    visibility: 'hidden',
    width: 'max-content',
  });
  labelElement.ownerDocument.body.append(measurement);
  const width = Math.max(
    measurement.getBoundingClientRect().width,
    measurement.offsetWidth,
    measurement.scrollWidth,
  );
  measurement.remove();
  return width;
};

const getDefaultPillWidth = (
  label: string,
  metadata?: VariablePillMetadata,
): string => {
  // `ch` tracks the monospace glyph width; the half-rem allowance prevents
  // subpixel rounding and the ellipsis itself from clipping the final glyph.
  const labelPadding = metadata ? 2.5 : 3.5;
  const labelSectionWidth = `max(6rem, calc(${Array.from(label).length}ch + ${labelPadding}rem))`;
  const fixedWidth = metadata
    ? metadata.validations.length > 0
      ? 9.125
      : 7.375
    : 3.25;

  return `calc(${labelSectionWidth} + ${fixedWidth}rem)`;
};

const getVariablePillStyle = (
  label: string,
  type: VariableType,
  {
    width,
    minWidth,
    maxWidth,
  }: Pick<VariablePillProps, 'width' | 'minWidth' | 'maxWidth'>,
  metadata?: VariablePillMetadata,
): VariablePillStyle => {
  const accentColor = getRawColorToken(getColorForType(type));
  return {
    '--variable-pill-accent': `oklch(var(--${accentColor}))`,
    '--variable-pill-width': width ?? getDefaultPillWidth(label, metadata),
    '--variable-pill-min-width': minWidth ?? DEFAULT_MIN_WIDTH,
    '--variable-pill-max-width':
      maxWidth ??
      width ??
      (metadata ? DEFAULT_METADATA_MAX_WIDTH : DEFAULT_MAX_WIDTH),
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
    VARIABLE_PILL_MARKER,
    'font-monospace inline-flex h-12 w-(--variable-pill-width) max-w-(--variable-pill-max-width) min-w-(--variable-pill-min-width) flex-nowrap rounded-full p-0.5 text-base',
    'effect-shadow-sm',
    animated ? 'variable-pill-effect-border' : 'bg-(--variable-pill-accent)',
    !interactive && 'cursor-default',
    fluid && 'flex-1',
    interactive &&
      'focusable hover:effect-shadow focus-visible:effect-shadow active:effect-shadow cursor-pointer appearance-none border-0 text-left transition-shadow duration-150 ease-out',
  );

function VariablePillStatusIcon({ status }: { status: VariablePillStatus }) {
  return (
    <span
      className={cx(
        'bg-text/10 text-text flex size-6 shrink-0 items-center justify-center rounded-full',
        status.isDefault && 'opacity-60',
      )}
      title={status.label}
      data-variable-pill-status={status.key}
    >
      <VariableValidationIcon icon={status.icon} />
    </span>
  );
}

function VariablePillMetadataRail({
  metadata,
  showDistribution = true,
}: {
  metadata: VariablePillMetadata;
  showDistribution?: boolean;
}) {
  const validationLayout = getValidationLayout(metadata.validations.length);

  if (metadata.validations.length === 0 && !showDistribution) return null;

  return (
    <span
      className="border-text/10 ml-auto flex h-7 shrink-0 items-center gap-1 border-l px-2"
      aria-hidden
    >
      {metadata.validations.length > 0 && (
        <span
          className={cx('items-center gap-1', validationLayout.fullClassName)}
          data-variable-pill-validation-list
        >
          {metadata.validations.map((status) => (
            <VariablePillStatusIcon key={status.key} status={status} />
          ))}
        </span>
      )}
      {metadata.validations.length > 1 && (
        <span
          className={cx(
            'bg-text/10 text-text size-6 shrink-0 items-center justify-center rounded-full',
            validationLayout.summaryClassName,
          )}
          title="Has validation rules"
          data-variable-pill-validation-summary
        >
          <VariableValidationIcon icon="hasValidations" />
        </span>
      )}
      {showDistribution && (
        <span
          className={cx(
            'text-text ml-0.5 flex h-6 w-12 shrink-0 items-center justify-center',
            metadata.synthetic.isDefault && 'opacity-60',
          )}
          title={metadata.synthetic.label}
          data-variable-pill-status={metadata.synthetic.key}
        >
          <VariableDistributionIcon shape={metadata.synthetic.shape} />
        </span>
      )}
    </span>
  );
}

function VariablePillContents({
  children,
  metadata,
  showDistribution = true,
  type,
}: {
  children: React.ReactNode;
  metadata?: VariablePillMetadata;
  showDistribution?: boolean;
  type: VariableType;
}) {
  const icon = useMemo(() => getIconForType(type), [type]);

  return (
    <span className="text-text bg-surface @container flex h-full w-full overflow-hidden rounded-[inherit]">
      <span className="flex shrink-0 basis-12 items-center justify-center border-r border-white/25 bg-(--variable-pill-accent)">
        <img
          className="icon w-5 opacity-80"
          src={icon}
          alt={`${type} variable`}
        />
      </span>
      <span className="flex w-[calc(100%-3rem)] min-w-0 flex-1 items-center">
        <span className="relative flex h-full min-w-24 flex-1 items-center overflow-hidden">
          {children}
        </span>
        {metadata && (
          <VariablePillMetadataRail
            metadata={metadata}
            showDistribution={showDistribution}
          />
        )}
      </span>
    </span>
  );
}

/**
 * A variable reference whose interaction and visual treatment are independent.
 * Static pills use `<data>` semantics. Editable pills expand out of layout on
 * hover/focus, then move into a modal editor whose name field occupies the pill
 * and whose remaining controls live in an attached popup surface.
 */
export const VariablePill = ({
  animated = false,
  editable = false,
  label,
  maxWidth,
  minWidth,
  type,
  uuid,
  variable,
  width,
}: VariablePillProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeAnnouncementRef = useRef('');
  const closingLabelRef = useRef(label);
  const closeGuardRef = useRef<(() => Promise<boolean>) | null>(null);
  const previewExpansionRef = useRef(0);
  const labelRef = useRef<HTMLSpanElement>(null);
  const previewFrameRef = useRef<number | null>(null);
  const returnFrameRef = useRef<number | null>(null);
  const returnFocusRef = useRef(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const formId = useId();
  const metadataDescriptionId = useId();
  const shouldReduceMotion = useReducedMotion();

  const [editing, setEditing] = useState(false);
  const [editorClosing, setEditorClosing] = useState(false);
  const [editorOrigin, setEditorOrigin] = useState<EditorOrigin | null>(null);
  const [editorReturning, setEditorReturning] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState('');

  const metadata = useMemo(
    () => (variable ? getVariablePillMetadata(variable) : undefined),
    [variable],
  );
  const validationCount = metadata?.validations.length ?? 0;
  const validationLayout = getValidationLayout(validationCount);

  const style = getVariablePillStyle(
    label,
    type,
    { width, minWidth, maxWidth },
    metadata,
  );
  const shouldPreview = !editing && (hovered || focused);
  const previewTransition = previewExpanded
    ? PILL_PREVIEW_EXPAND_TRANSITION
    : PILL_PREVIEW_CONTRACT_TRANSITION;

  const measurePreview = useCallback(
    (reuseHiddenWidth = false) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const labelElement = labelRef.current;
      if (!rect || !labelElement || rect.width === 0 || rect.height === 0)
        return;

      const requiredExpansion = reuseHiddenWidth
        ? previewExpansionRef.current
        : (() => {
            const intrinsicLabelWidth =
              measureIntrinsicLabelWidth(labelElement);
            const hiddenLabelWidth = Math.max(
              0,
              intrinsicLabelWidth - labelElement.clientWidth,
              labelElement.scrollWidth - labelElement.clientWidth,
            );
            const validationsAreCollapsed =
              validationCount > 1 &&
              rect.width <
                validationLayout.minimumWidth + PILL_HORIZONTAL_INSET;
            const fullValidationWidth =
              validationCount * VALIDATION_ICON_WIDTH +
              Math.max(0, validationCount - 1) * VALIDATION_GAP;
            const validationExpansion = validationsAreCollapsed
              ? Math.max(0, fullValidationWidth - VALIDATION_ICON_WIDTH)
              : 0;
            const validationThresholdExpansion = validationsAreCollapsed
              ? Math.max(
                  0,
                  validationLayout.minimumWidth +
                    PILL_HORIZONTAL_INSET -
                    rect.width,
                )
              : 0;
            const buttonElement = buttonRef.current;
            const contentsElement = buttonElement?.firstElementChild;
            const clippedContentWidth = Math.max(
              0,
              (buttonElement?.scrollWidth ?? 0) -
                (buttonElement?.clientWidth ?? 0),
              contentsElement instanceof HTMLElement
                ? contentsElement.scrollWidth - contentsElement.clientWidth
                : 0,
            );

            return Math.max(
              hiddenLabelWidth + validationExpansion + clippedContentWidth,
              validationThresholdExpansion,
            );
          })();
      if (requiredExpansion <= 1) {
        previewExpansionRef.current = 0;
        setPreviewLayout(null);
        return;
      }

      previewExpansionRef.current = requiredExpansion;
      setPreviewLayout(getPreviewLayout(rect, requiredExpansion));
    },
    [validationCount, validationLayout.minimumWidth],
  );

  useLayoutEffect(() => {
    if (shouldPreview) {
      if (!previewLayout) {
        measurePreview();
        return;
      }
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }
      if (returnFrameRef.current !== null) {
        cancelAnimationFrame(returnFrameRef.current);
      }
      previewFrameRef.current = requestAnimationFrame(() => {
        setPreviewExpanded(true);
        previewFrameRef.current = null;
      });
      return;
    }

    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    setPreviewExpanded(false);
  }, [measurePreview, previewLayout, shouldPreview]);

  useEffect(
    () => () => {
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!previewLayout || editing) return undefined;

    const syncPreview = () => measurePreview(true);
    window.addEventListener('resize', syncPreview);
    window.addEventListener('scroll', syncPreview, true);
    return () => {
      window.removeEventListener('resize', syncPreview);
      window.removeEventListener('scroll', syncPreview, true);
    };
  }, [editing, measurePreview, previewLayout]);

  useEffect(() => {
    if (editing || !returnFocusRef.current) return undefined;
    returnFocusRef.current = false;
    let frame: number | null = null;
    const timeout = window.setTimeout(
      () => {
        frame = requestAnimationFrame(() => buttonRef.current?.focus());
      },
      shouldReduceMotion ? 0 : 200,
    );
    return () => {
      window.clearTimeout(timeout);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [editing, shouldReduceMotion]);

  if (!editable || uuid === undefined) {
    return (
      <data
        value={label}
        aria-label={metadata ? label : undefined}
        aria-describedby={metadata ? metadataDescriptionId : undefined}
        className={getVariablePillClassName({
          animated,
          fluid: width === '100%',
        })}
        style={style}
      >
        <VariablePillContents metadata={metadata} type={type}>
          <span
            className={cx(
              'm-0 min-w-0 grow overflow-hidden break-keep text-ellipsis whitespace-nowrap',
              metadata ? 'px-4' : 'px-6',
            )}
          >
            {label}
          </span>
        </VariablePillContents>
        {metadata && (
          <span id={metadataDescriptionId} className="sr-only">
            {metadata.accessibleText}
          </span>
        )}
      </data>
    );
  }

  const openEditor = () => {
    const currentRect = buttonRef.current?.getBoundingClientRect();
    if (currentRect) {
      setEditorOrigin({
        expandedWidth: previewLayout?.expandedWidth ?? currentRect.width,
        left: currentRect.left,
        top: currentRect.top,
        width: currentRect.width,
      });
    }
    closeAnnouncementRef.current = '';
    closingLabelRef.current = label;
    closeGuardRef.current = null;
    if (returnFrameRef.current !== null) {
      cancelAnimationFrame(returnFrameRef.current);
      returnFrameRef.current = null;
    }
    setEditorClosing(false);
    setEditorReturning(false);
    setAnnouncement(`Editing variable ${label}`);
    setEditing(true);
  };

  const finishClosingEditor = () => {
    returnFocusRef.current = true;
    setFocused(true);
    setPreviewExpanded(true);
    setEditing(false);
    setEditorClosing(false);
    setEditorReturning(false);
    setEditorOrigin(null);
    setHovered(false);
    setAnnouncement(closeAnnouncementRef.current);
  };

  const closeEditor = (nextAnnouncement: string, closingLabel = label) => {
    if (editorClosing) return;
    closeAnnouncementRef.current = nextAnnouncement;
    closingLabelRef.current = closingLabel;
    if (shouldReduceMotion || !editorOrigin) {
      finishClosingEditor();
      return;
    }
    setEditorClosing(true);
    returnFrameRef.current = requestAnimationFrame(() => {
      returnFrameRef.current = requestAnimationFrame(() => {
        setEditorReturning(true);
        returnFrameRef.current = null;
      });
    });
  };

  // Escape and backdrop dismissal share the editor's own close guard,
  // so a dirty draft always asks before being discarded, whichever way the
  // modal closes.
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen || editorClosing) return;
    const guard = closeGuardRef.current;
    if (!guard) {
      closeEditor('Variable edit cancelled');
      return;
    }
    void guard().then((allowed) => {
      if (allowed) closeEditor('Variable edit cancelled');
      return allowed;
    });
  };

  const popupWidth = Math.min(
    EDITOR_MAX_WIDTH,
    window.innerWidth - EDITOR_VIEWPORT_GUTTER * 2,
  );
  const previewPillWidth =
    editorOrigin?.expandedWidth ?? previewLayout?.expandedWidth ?? popupWidth;
  const editorPillWidth = Math.min(
    previewPillWidth + EDITOR_NAME_FIELD_ALLOWANCE,
    (window.innerWidth - EDITOR_VIEWPORT_GUTTER * 2) / PILL_EDITOR_SCALE,
  );
  const modalWidth = Math.max(popupWidth, editorPillWidth);
  const editorPillLeft = (window.innerWidth - editorPillWidth) / 2;
  const editorPillStyle: VariablePillStyle = {
    ...style,
    '--variable-pill-width': `${editorPillWidth}px`,
    '--variable-pill-min-width': `${editorPillWidth}px`,
    '--variable-pill-max-width': `${editorPillWidth}px`,
  };
  const pillMotionOrigin = editorOrigin
    ? {
        x: editorOrigin.left - editorPillLeft,
        y: editorOrigin.top - EDITOR_TOP,
        width: editorOrigin.width,
        scale: 1,
      }
    : false;

  return (
    <>
      <span
        ref={wrapperRef}
        className="relative inline-flex align-middle"
        data-variable-pill-placeholder
        style={
          previewLayout
            ? {
                height: previewLayout.collapsedHeight,
                width: previewLayout.collapsedWidth,
              }
            : undefined
        }
      >
        {!editing && (
          <Tooltip>
            <TooltipTrigger
              render={
                <motion.button
                  ref={buttonRef}
                  type="button"
                  aria-expanded={editing}
                  aria-haspopup="dialog"
                  aria-label={`Edit variable: ${label}`}
                  aria-describedby={
                    metadata ? metadataDescriptionId : undefined
                  }
                  className={getVariablePillClassName({
                    animated,
                    fluid: width === '100%',
                    interactive: true,
                  })}
                  data-variable-pill-preview={
                    previewExpanded ? 'expanded' : 'collapsed'
                  }
                  initial={false}
                  animate={
                    previewLayout
                      ? {
                          x: previewExpanded
                            ? previewLayout.expandedLeft -
                              previewLayout.collapsedLeft
                            : 0,
                          width: previewExpanded
                            ? previewLayout.expandedWidth
                            : previewLayout.collapsedWidth,
                        }
                      : undefined
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : {
                          x: previewTransition,
                          width: previewTransition,
                        }
                  }
                  onAnimationComplete={() => {
                    if (!shouldPreview) setPreviewLayout(null);
                  }}
                  onBlur={() => setFocused(false)}
                  onClick={openEditor}
                  onFocus={() => setFocused(true)}
                  onPointerEnter={() => setHovered(true)}
                  onPointerLeave={() => setHovered(false)}
                  style={
                    previewLayout
                      ? {
                          ...style,
                          position: 'fixed',
                          zIndex: 3001,
                          top: previewLayout.collapsedTop,
                          left: previewLayout.collapsedLeft,
                          width: previewLayout.collapsedWidth,
                          maxWidth: 'none',
                          minWidth: 0,
                        }
                      : style
                  }
                >
                  <VariablePillContents
                    metadata={metadata}
                    showDistribution={shouldPreview}
                    type={type}
                  >
                    <span
                      ref={labelRef}
                      className={cx(
                        'm-0 min-w-0 grow overflow-hidden break-keep text-ellipsis whitespace-nowrap',
                        metadata ? 'px-4' : 'px-6',
                      )}
                      data-variable-pill-label
                    >
                      {label}
                    </span>
                  </VariablePillContents>
                </motion.button>
              }
            />
            <TooltipContent side="top">Click to edit</TooltipContent>
          </Tooltip>
        )}
      </span>

      <Modal open={editing} onOpenChange={handleOpenChange}>
        {editing && (
          <ModalPopup
            aria-label="Edit variable"
            className="pointer-events-none fixed top-6 left-1/2 z-3000 -translate-x-1/2 bg-transparent outline-none"
            initial={{ opacity: 0.9999 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
            style={{ width: modalWidth }}
          >
            <VariableEditor
              uuid={uuid}
              formId={formId}
              onSaved={(name) => closeEditor(`Variable ${name} saved`, name)}
              onCancelled={() => closeEditor('Variable edit cancelled')}
              registerCloseGuard={(guard) => {
                closeGuardRef.current = guard;
              }}
              renderNameField={(nameField) => (
                <div className="pointer-events-none flex w-full justify-center">
                  <motion.div
                    className={cx(
                      getVariablePillClassName({
                        animated: editorClosing ? animated : false,
                      }),
                      'pointer-events-auto',
                    )}
                    data-variable-pill-editor-name
                    data-variable-pill-editing={!editorClosing}
                    data-variable-pill-returning={editorReturning}
                    initial={shouldReduceMotion ? false : pillMotionOrigin}
                    animate={
                      editorReturning && pillMotionOrigin
                        ? pillMotionOrigin
                        : {
                            x: 0,
                            y: 0,
                            width: editorPillWidth,
                            scale: PILL_EDITOR_SCALE,
                          }
                    }
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : PILL_EDITOR_LAYOUT_TRANSITION
                    }
                    onAnimationComplete={() => {
                      if (editorReturning) finishClosingEditor();
                    }}
                    style={editorPillStyle}
                  >
                    <VariablePillContents metadata={metadata} type={type}>
                      {editorClosing ? (
                        <span
                          className="m-0 min-w-0 grow overflow-hidden px-4 break-keep text-ellipsis whitespace-nowrap"
                          data-variable-pill-editor-label
                        >
                          {closingLabelRef.current}
                        </span>
                      ) : (
                        nameField
                      )}
                    </VariablePillContents>
                  </motion.div>
                </div>
              )}
              renderBody={(body) => (
                <BaseUISharedPopoverContainer
                  className={cx(
                    'relative mx-auto mt-4 flex max-h-[calc(100dvh-7rem)] min-h-0 w-[min(100%,42rem)] flex-col overflow-visible',
                    editorClosing
                      ? 'pointer-events-none'
                      : 'pointer-events-auto',
                  )}
                  data-variable-pill-editor-body
                  initial={
                    shouldReduceMotion
                      ? false
                      : { opacity: 0, y: -8, scale: 0.98 }
                  }
                  animate={
                    editorClosing
                      ? { opacity: 0, y: -8, scale: 0.98 }
                      : { opacity: 1, y: 0, scale: 1 }
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : editorClosing
                        ? { duration: 0.15, ease: 'easeIn' }
                        : {
                            type: 'tween',
                            duration: 0.42,
                            ease: [0.4, 0, 0.2, 1],
                            delay: 0.2,
                          }
                  }
                >
                  <span
                    aria-hidden
                    className="absolute -top-4 left-1/2 z-10 flex -translate-x-1/2 leading-none"
                    data-variable-pill-editor-arrow
                  >
                    <ArrowSvg className="block" />
                  </span>
                  {body}
                </BaseUISharedPopoverContainer>
              )}
            />
          </ModalPopup>
        )}
      </Modal>

      {metadata && (
        <span id={metadataDescriptionId} className="sr-only">
          {metadata.accessibleText}
        </span>
      )}
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
  const variableSelector = useMemo(
    () => makeGetVariableWithEntity(uuid),
    [uuid],
  );
  const variable = useAppSelector(variableSelector);
  const variableDefinitionSelector = useMemo(
    () => makeGetVariable(uuid),
    [uuid],
  );
  const variableDefinition = useAppSelector(variableDefinitionSelector);
  const { name, type } = variable ?? {};

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
      uuid={uuid}
      variable={variableDefinition ?? undefined}
      width={width}
    />
  );
};

export const ConnectedVariablePill = React.memo(ConnectedVariablePillComponent);
