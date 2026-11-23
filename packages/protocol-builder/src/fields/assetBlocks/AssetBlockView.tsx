import {
  type ComponentType,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';
import {
  assetBlockAudioRowVariants,
  assetBlockMediaVariants,
} from '@codaco/fresco-ui/assetBlockLayout';
import { Badge } from '@codaco/fresco-ui/Badge';
import {
  assetBlockControlsAt,
  type RichTextAssetBlockKind,
  type RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { surfaceSpacingVariants } from '@codaco/fresco-ui/layout/Surface';
import { Popover, PopoverContent } from '@codaco/fresco-ui/Popover';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import { useTokenPillLanguage } from '@codaco/fresco-ui/TokenPill';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { messages, type SizeChoice } from './assetBlockMessages.ts';
import {
  AssetBlockSettings,
  type AssetBlockFileField,
} from './AssetBlockSettings.tsx';
import { hasRatio, useDrawnFile } from './drawnFile.ts';
import { ResizeCorner } from './ResizeCorner.tsx';
import {
  COVERED_PROBE_STYLE,
  scrollerOf,
  SETTINGS_COLLISIONS,
  SETTINGS_OFFSET,
  useSettingsPlacement,
} from './settingsPlacement.ts';

/** A file a block names, as the page it is edited on knows it. */
export type KnownAsset = Readonly<{
  kind: RichTextAssetBlockKind;
  name: string;
}>;

/** How a view finds and draws the files its blocks name. */
export type AssetBlockViewSource = Readonly<{
  /**
   * The file an id names, or `undefined` when the protocol holds no such
   * file or holds one a page cannot show. A hook: called as the view renders.
   */
  useAsset: (assetId: string) => KnownAsset | undefined;
  /** Draws the file itself. */
  Preview: ComponentType<
    KnownAsset & Readonly<{ assetId: string; className?: string }>
  >;
  /**
   * Where a block's settings offer to replace its file. Without one, a block
   * keeps the file it has, and is deleted to be rid of it.
   */
  FileField?: AssetBlockFileField;
}>;

// The direction text runs in where an element sits: what the nearest `dir`
// says, or what the browser worked out where that says `auto`.
const directionAt = (element: Element): 'ltr' | 'rtl' => {
  const stated = element.closest('[dir]')?.getAttribute('dir');
  if (stated === 'rtl' || stated === 'ltr') return stated;
  return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
};

// The language of the text where an element sits: what the nearest `lang`
// says, or nothing where none does.
const languageAt = (element: Element): string | undefined =>
  element.closest('[lang]')?.getAttribute('lang') ?? undefined;

const SETTINGS_NAMES = {
  image: 'Image settings',
  audio: 'Audio settings',
  video: 'Video settings',
} as const;

/**
 * How a block is drawn in the text of a page being written: the file as the
 * participant will meet it, at the size and place it is given. While the
 * block is selected and the researcher is in the field, what changes those
 * stands over the page beside it (`AssetBlockSettings`), and a picture's
 * corner can be dragged from one size to the next (`ResizeCorner`). A block
 * naming a file the protocol no longer holds, or one a page cannot show, says
 * so, since that is what the researcher needs to put right.
 *
 * Made from where its files come from (`AssetBlockViewSource`), so the stage
 * editor and the translation table draw the same block from their own stores.
 */
export const createAssetBlockView = ({
  useAsset,
  Preview,
  FileField,
}: AssetBlockViewSource): ComponentType<RichTextAssetBlockViewProps> =>
  function AssetBlockView({
    attributes,
    selected,
    editable,
    active,
    update,
    remove,
    returnToText,
  }) {
    const intl = useAppIntl();
    const asset = useAsset(attributes.assetId);
    const settingsId = useId();
    const settingsNameId = useId();
    const boxRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLDivElement>(null);
    const drawn = useDrawnFile(boxRef);
    // The alignment icons point where the file will sit, which is a matter of
    // the text's direction and not the interface's: a page written in Arabic
    // is edited from an English interface, and the other way about. Read at
    // the block, since the settings stand over the page and not in the text.
    const appDirection = useAppDirection();
    const [direction, setDirection] = useState(appDirection);
    // And the text's language, which the block's description is written in,
    // while the settings it is typed into stand over the page, outside the
    // text.
    const [language, setLanguage] = useState<string | undefined>(undefined);
    // What the block says in the interface's own words, inside text in the
    // language being written.
    const interfaceLanguage = useTokenPillLanguage();
    // The size the corner is being dragged to, while it is being dragged.
    const [dragged, setDragged] = useState<SizeChoice | undefined>(undefined);
    // Whether the file field's resource browser is open. The settings stand
    // on a layer above every dialog, so they are hidden while it is, or they
    // would cover the files to choose from. Hidden, not closed: the browser
    // belongs to the field inside them, and goes when they are taken away.
    const [browsing, setBrowsing] = useState(false);
    const size =
      dragged === undefined
        ? attributes.size
        : dragged === 'full'
          ? null
          : dragged;
    const working = selected && editable;
    // Kept while the browser is open whether or not focus is in the field:
    // hiding the settings takes focus off the control that opened the
    // browser before the browser has taken it, and settings closed in that
    // moment would take the browser away with them.
    const showsSettings =
      working && (active || browsing) && dragged === undefined;
    // What the page scrolls in, which the settings keep inside.
    const [scroller, setScroller] = useState<Element | undefined>(undefined);
    // Both read as the settings are about to show, where they may since have
    // changed.
    useLayoutEffect(() => {
      if (showsSettings && boxRef.current !== null) {
        setDirection(directionAt(boxRef.current));
        setLanguage(languageAt(boxRef.current));
        setScroller(scrollerOf(boxRef.current));
      }
    }, [showsSettings]);
    // What the settings stand beside: the file where it is drawn, or the
    // block's box until it is.
    const anchorRef = drawn === undefined ? boxRef : fileRef;
    // What scrolls inside the settings, should the window be too short for
    // them: its full height is theirs.
    const [panel, setPanel] = useState<HTMLElement | null>(null);
    // Where the host's bars are read from.
    const coveredRef = useRef<HTMLSpanElement>(null);
    const placement = useSettingsPlacement(
      showsSettings && !browsing,
      anchorRef,
      panel,
      scroller,
      coveredRef,
    );

    return (
      <>
        <div
          ref={boxRef}
          className={cx(
            'relative',
            asset?.kind === 'audio' &&
              assetBlockAudioRowVariants({ align: attributes.align }),
          )}
          data-drag-handle=""
          {...assetBlockControlsAt(settingsId)}
        >
          {asset === undefined ? (
            <Badge tone="warning" {...interfaceLanguage}>
              {intl.formatMessage(messages.unusable)}
            </Badge>
          ) : (
            <Preview
              assetId={attributes.assetId}
              kind={asset.kind}
              name={
                attributes.description.trim() === ''
                  ? asset.name
                  : attributes.description
              }
              className={
                asset.kind === 'audio'
                  ? ''
                  : cx(
                      'w-full rounded object-contain',
                      assetBlockMediaVariants({
                        size: size ?? undefined,
                        align: attributes.align,
                      }),
                    )
              }
            />
          )}
          {drawn !== undefined && (
            // Where the file is drawn, which is what its settings stand
            // beside: a small picture in a wide box has them under itself.
            <div
              ref={fileRef}
              className="pointer-events-none absolute"
              style={{
                left: drawn.left,
                top: drawn.top,
                width: drawn.width,
                height: drawn.height,
              }}
            />
          )}
          {working && (
            <span
              ref={coveredRef}
              aria-hidden
              className="invisible absolute size-0"
              style={COVERED_PROBE_STYLE}
            />
          )}
          {drawn !== undefined && working && hasRatio(drawn) && (
            <ResizeCorner
              boxRef={boxRef}
              drawn={drawn}
              size={size ?? 'full'}
              onDrag={setDragged}
              onDrop={(dropped) => {
                setDragged(undefined);
                const next = dropped === 'full' ? null : dropped;
                if (next !== attributes.size) update({ size: next });
              }}
            />
          )}
        </div>
        <Popover
          open={showsSettings}
          onOpenChange={(open, event) => {
            // Open for as long as the block is being worked on, which is not
            // this popover's to end. Escape leaves its controls for the block.
            if (!open && event.reason === 'escape-key') returnToText();
          }}
        >
          <PopoverContent
            id={settingsId}
            anchor={anchorRef}
            side={placement.side}
            sideOffset={SETTINGS_OFFSET}
            collisionAvoidance={
              placement.overlaps
                ? SETTINGS_COLLISIONS.over
                : SETTINGS_COLLISIONS.beside
            }
            collisionPadding={placement.clearance}
            collisionBoundary={scroller}
            aria-labelledby={settingsNameId}
            // The caret stays on the block until Enter takes it in here, and
            // is the text's again when these go.
            initialFocus={false}
            finalFocus={false}
            // No taller than the room left clear of the window's edges, and
            // scrolled within, so that every setting can be reached in a
            // short window.
            spacing="none"
            className={cx(
              'max-h-(--available-height) flex-col',
              browsing ? 'hidden' : 'flex',
            )}
            // Over the file, an arrow would point at what they cover.
            showArrow={!browsing && !placement.overlaps}
          >
            <span id={settingsNameId} className="sr-only" lang="en">
              {asset === undefined
                ? 'Block settings'
                : SETTINGS_NAMES[asset.kind]}
            </span>
            <ScrollArea
              ref={setPanel}
              className="min-h-0"
              // Not a stop of its own: every setting in it can be reached, and
              // is scrolled to as it is. A region that scrolled would otherwise
              // be the first control Enter on the block goes to.
              tabIndex={-1}
              // A control scrolled to as it takes focus comes clear of the
              // edge it was hidden behind, and of the fade drawn there.
              viewportClassName={cx(
                surfaceSpacingVariants({ spacing: 'sm' }),
                'scroll-py-6',
              )}
            >
              <AssetBlockSettings
                asset={asset}
                attributes={attributes}
                direction={direction}
                language={language}
                update={update}
                remove={remove}
                returnToText={returnToText}
                FileField={FileField}
                onBrowserOpenChange={setBrowsing}
              />
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </>
    );
  };
