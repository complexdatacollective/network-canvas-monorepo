import React, { useId, useMemo, useRef, useState } from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import type { VariableType } from '@codaco/protocol-validation';
import { getColorForType, getIconForType } from '~/config/variables';
import { useAppSelector } from '~/ducks/hooks';
import { makeGetVariableWithEntity } from '~/selectors/codebook';
import { cx } from '~/utils/cva';

import VariableEditor from './VariableEditor/VariableEditor';

type VariablePillSizingProps = {
  width?: string;
  minWidth?: string;
  maxWidth?: string;
};

export type VariablePillProps = VariablePillSizingProps & {
  label: string;
  type: VariableType;
  animated?: boolean;
  /**
   * Editing requires the codebook variable's uuid: the pill anchors a popover
   * containing the full variable editor (name, type-specific configuration,
   * synthetic data), all saved atomically. Pills without a uuid render
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

const getRawColorToken = (color: string) =>
  color.endsWith(DARK_COLOR_SUFFIX)
    ? `${color.slice(0, -DARK_COLOR_SUFFIX.length)}--dark`
    : color;

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
 * Static pills use `<data>` semantics; editable pills are a button anchoring a
 * popover that contains the full variable editor, headed by the same pill
 * treatment around the name field.
 */
export const VariablePill = ({
  animated = false,
  editable = false,
  label,
  maxWidth,
  minWidth,
  type,
  uuid,
  width,
}: VariablePillProps) => {
  const closeGuardRef = useRef<(() => Promise<boolean>) | null>(null);
  const formId = useId();

  const [editing, setEditing] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const style = getVariablePillStyle(type, { width, minWidth, maxWidth });
  // The editor header pill fills the popover's width.
  const headerPillStyle: VariablePillStyle = {
    ...style,
    '--variable-pill-width': '100%',
    '--variable-pill-max-width': '100%',
  };

  if (!editable || uuid === undefined) {
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

  const openEditor = () => {
    closeGuardRef.current = null;
    setAnnouncement(`Editing variable ${label}`);
    setEditing(true);
  };

  const closeEditor = (nextAnnouncement: string) => {
    setEditing(false);
    setAnnouncement(nextAnnouncement);
  };

  // Escape and outside-click dismissal share the editor's own close guard,
  // so a dirty draft always asks before being discarded, whichever way the
  // popover closes.
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      openEditor();
      return;
    }
    const guard = closeGuardRef.current;
    if (!guard) {
      closeEditor('Variable edit cancelled');
      return;
    }
    void guard().then((allowed) => {
      if (allowed) closeEditor('Variable edit cancelled');
    });
  };

  return (
    <>
      <Tooltip>
        <Popover open={editing} onOpenChange={handleOpenChange}>
          {/*
           * The popover trigger renders the tooltip trigger, which renders the
           * pill itself: one button carrying both behaviours, rather than a
           * wrapper that would break the pill's layout or steal its focus.
           */}
          <PopoverTrigger
            render={
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`Edit variable: ${label}`}
                    className={getVariablePillClassName({
                      animated,
                      fluid: width === '100%',
                      interactive: true,
                    })}
                    style={style}
                  >
                    <VariablePillContents type={type}>
                      <span className="m-0 min-w-0 grow overflow-hidden px-6 break-keep text-ellipsis whitespace-nowrap">
                        {label}
                      </span>
                    </VariablePillContents>
                  </button>
                }
              />
            }
          />
          <PopoverContent
            aria-label="Edit variable"
            side="bottom"
            align="start"
            showArrow
            className="w-[min(90vw,42rem)]"
          >
            {editing && (
              <VariableEditor
                uuid={uuid}
                formId={formId}
                onSaved={(name) => closeEditor(`Variable ${name} saved`)}
                onCancelled={() => closeEditor('Variable edit cancelled')}
                registerCloseGuard={(guard) => {
                  closeGuardRef.current = guard;
                }}
                renderHeader={(nameField) => (
                  <div
                    className={getVariablePillClassName({ animated: false })}
                    style={headerPillStyle}
                  >
                    <VariablePillContents type={type}>
                      {nameField}
                    </VariablePillContents>
                  </div>
                )}
              />
            )}
          </PopoverContent>
        </Popover>
        <TooltipContent side="top">Edit variable: {label}</TooltipContent>
      </Tooltip>

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
      width={width}
    />
  );
};

export const ConnectedVariablePill = React.memo(ConnectedVariablePillComponent);
