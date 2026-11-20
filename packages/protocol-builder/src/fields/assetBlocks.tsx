import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Image as ImageIcon,
  TriangleAlert,
  Video,
  Volume2,
} from 'lucide-react';
import {
  type ComponentType,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { Button } from '@codaco/fresco-ui/Button';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  assetBlockControlsAt,
  assetBlockControlsProps,
  type RichTextAssetBlockAttributes,
  type RichTextAssetBlockKind,
  type RichTextAssetBlocks,
  type RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { Popover, PopoverContent } from '@codaco/fresco-ui/Popover';
import type { MarkdownBlockImages } from '@codaco/fresco-ui/RenderMarkdown';
import SegmentedSwitcher from '@codaco/fresco-ui/SegmentedSwitcher';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  isAssetBlockKind,
  isAssetBlockUrl,
  readAssetBlockUrl,
} from '@codaco/protocol-validation';

import { useResourceClient } from '../resources/client.tsx';
import ResourceBrowserDialog from '../resources/components/ResourceBrowserDialog.tsx';
import {
  acceptsResourceKind,
  RESOURCE_PICKER_COPY,
  unsupportedResourceKindMessage,
} from '../resources/components/resourceKinds.ts';
import ResourcePreview from '../resources/components/ResourcePreview.tsx';
import type { ResourceDescriptor } from '../resources/types.ts';
import { useProtocolContext } from '../state/protocolContext.ts';

// The ids these messages had as the settings of an item in a page's list of
// blocks, before a page became one text: the words are the same, so their
// translations still stand.
const messages = defineMessages({
  unusable: {
    id: 'protocolBuilder.contentBlock.previewUnusable',
    defaultMessage:
      'This block’s resource is not in this protocol, or is not something a page can show.',
    description:
      'Shown in the text of a page participants read, in place of an image, audio recording or video placed in that text, when it points at a file the protocol no longer holds, or at one a page cannot present — a roster of people, a map layer, a key.',
  },
  descriptionLabel: {
    id: 'protocolBuilder.contentBlock.descriptionLabel',
    defaultMessage: 'Description',
    description:
      'Label of the control, in the settings of an image, audio recording or video placed in the text of a page, holding the words that stand in for the file for a participant who cannot see or hear it.',
  },
  imageDescriptionHint: {
    id: 'protocolBuilder.contentBlock.imageDescriptionHint',
    defaultMessage:
      'What this image shows, read aloud to a participant who cannot see it. Leave it empty if the image is decorative.',
    description:
      'Guidance under the description control of an image placed in the text of a page. Decorative means the picture adds nothing a participant would miss.',
  },
  audioDescriptionHint: {
    id: 'protocolBuilder.contentBlock.audioDescriptionHint',
    defaultMessage:
      'What this recording is, read aloud in place of the file’s name to a participant using a screen reader.',
    description:
      'Guidance under the description control of an audio recording placed in the text of a page.',
  },
  videoDescriptionHint: {
    id: 'protocolBuilder.contentBlock.videoDescriptionHint',
    defaultMessage:
      'What this video shows, read aloud in place of the file’s name to a participant using a screen reader.',
    description:
      'Guidance under the description control of a video placed in the text of a page.',
  },
  sizeFull: {
    id: 'protocolBuilder.contentBlock.sizeFull',
    defaultMessage: 'Full size',
    description:
      'Choice offered for how tall a picture or video on a page is drawn: however tall it naturally is, unconstrained.',
  },
  sizeSmall: {
    id: 'protocolBuilder.contentBlock.sizeSmall',
    defaultMessage: 'Small',
    description:
      'Choice offered for how tall a picture or video on a page is drawn.',
  },
  sizeMedium: {
    id: 'protocolBuilder.contentBlock.sizeMedium',
    defaultMessage: 'Medium',
    description:
      'Choice offered for how tall a picture or video on a page is drawn.',
  },
  sizeLarge: {
    id: 'protocolBuilder.contentBlock.sizeLarge',
    defaultMessage: 'Large',
    description:
      'Choice offered for how tall a picture or video on a page is drawn.',
  },
  autoplay: {
    id: 'protocolBuilder.assetBlock.autoplay',
    defaultMessage: 'Start playing automatically',
    description:
      'Label of a checkbox in the settings of an audio recording or video placed in the text of a page participants read. When ticked, the recording starts by itself as the participant reaches the page; when clear, the participant starts it.',
  },
  loop: {
    id: 'protocolBuilder.assetBlock.loop',
    defaultMessage: 'Repeat when it ends',
    description:
      'Label of a checkbox in the settings of an audio recording or video placed in the text of a page participants read. When ticked, the recording starts again from the beginning each time it finishes.',
  },
  remove: {
    id: 'protocolBuilder.assetBlock.remove',
    defaultMessage: 'Remove from the text',
    description:
      'Button in the settings of an image, audio recording or video placed in the text of a page. It takes the file out of the text; the file itself stays in the protocol.',
  },
});

const DESCRIPTION_HINTS = {
  image: messages.imageDescriptionHint,
  audio: messages.audioDescriptionHint,
  video: messages.videoDescriptionHint,
} as const;

/** A file a block names, as the page it is edited on knows it. */
type KnownAsset = Readonly<{ kind: RichTextAssetBlockKind; name: string }>;

/** How a view finds and draws the files its blocks name. */
type AssetBlockViewSource = Readonly<{
  /**
   * The file an id names, or `undefined` when the protocol holds no such
   * file or holds one a page cannot show. A hook: called as the view renders.
   */
  useAsset: (assetId: string) => KnownAsset | undefined;
  /** Draws the file itself. */
  Preview: ComponentType<
    KnownAsset & Readonly<{ assetId: string; className?: string }>
  >;
}>;

// The heights the interview holds an image or video to at each size (see
// the interview's `AssetBlock`), so the block is as tall here as there.
const SIZE_CLASSES = {
  small: 'max-h-48',
  medium: 'max-h-96',
  large: 'max-h-[60vh]',
} as const;

// An image or video held to a height is drawn inside a box as wide as the
// page, so where it sits across the page is where it sits in that box.
const POSITION_CLASSES = {
  start: 'object-left rtl:object-right',
  center: '',
  end: 'object-right rtl:object-left',
} as const;

// An audio player is as wide as the browser draws it, and sits in its line.
const JUSTIFY_CLASSES = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
} as const;

/**
 * Whether where a block sits can be seen. An image or video with no size is
 * as wide as the page, which leaves it nowhere else to sit, so its position
 * is offered only once it is held to a height. An audio player always has
 * room around it.
 */
const canBePlaced = (
  kind: RichTextAssetBlockKind,
  size: RichTextAssetBlockAttributes['size'],
): boolean => kind === 'audio' || size !== null;

type Size = NonNullable<RichTextAssetBlockAttributes['size']>;
type SizeChoice = Size | 'full';

// Smallest first.
const SIZES = ['small', 'medium', 'large'] as const satisfies readonly Size[];
// As they are offered: as the file is, then smallest first.
const SIZE_CHOICES = ['full', ...SIZES] as const;
type Align = RichTextAssetBlockAttributes['align'];

const isSizeChoice = (value: string): value is SizeChoice =>
  value === 'full' ||
  value === 'small' ||
  value === 'medium' ||
  value === 'large';

// The direction text runs in where an element sits: what the nearest `dir`
// says, or what the browser worked out where that says `auto`.
const directionAt = (element: Element): 'ltr' | 'rtl' => {
  const stated = element.closest('[dir]')?.getAttribute('dir');
  if (stated === 'rtl' || stated === 'ltr') return stated;
  return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
};

const SIZE_LABELS = {
  full: messages.sizeFull,
  small: messages.sizeSmall,
  medium: messages.sizeMedium,
  large: messages.sizeLarge,
} as const;

function AssetBlockSettings({
  asset,
  attributes,
  direction,
  update,
  remove,
  returnToText,
  pick,
}: Pick<
  RichTextAssetBlockViewProps,
  'attributes' | 'update' | 'remove' | 'returnToText' | 'pick'
> & {
  asset: KnownAsset | undefined;
  /** The direction the text runs in where the block sits. */
  direction: 'ltr' | 'rtl';
}) {
  const intl = useAppIntl();
  const descriptionId = useId();
  const hintId = useId();
  const kind = asset?.kind;
  const [StartIcon, EndIcon] =
    direction === 'rtl' ? [AlignRight, AlignLeft] : [AlignLeft, AlignRight];

  return (
    <div className="flex w-[27rem] max-w-full flex-col gap-3">
      {kind !== undefined && (
        <div className="flex flex-col gap-1">
          <label htmlFor={descriptionId} className="text-sm font-bold">
            {intl.formatMessage(messages.descriptionLabel)}
          </label>
          <InputField
            id={descriptionId}
            name={descriptionId}
            size="sm"
            aria-describedby={hintId}
            value={attributes.description}
            onChange={(description) =>
              update({ description: description ?? '' })
            }
          />
          <Paragraph id={hintId} intent="smallText" margin="none">
            {intl.formatMessage(DESCRIPTION_HINTS[kind])}
          </Paragraph>
        </div>
      )}
      {kind !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          {kind !== 'audio' && (
            <SegmentedSwitcher<SizeChoice>
              size="sm"
              aria-label="Display size"
              value={attributes.size ?? 'full'}
              onValueChange={(choice) => {
                if (!isSizeChoice(choice)) return;
                update({ size: choice === 'full' ? null : choice });
              }}
              options={SIZE_CHOICES.map((value) => ({
                value,
                label: intl.formatMessage(SIZE_LABELS[value]),
              }))}
            />
          )}
          {canBePlaced(kind, attributes.size) && (
            <SegmentedSwitcher<Align>
              size="sm"
              aria-label="Alignment"
              value={attributes.align}
              onValueChange={(align) => update({ align })}
              options={[
                {
                  value: 'start',
                  icon: StartIcon,
                  label: (
                    <span className="sr-only" lang="en">
                      {'Align to the start'}
                    </span>
                  ),
                },
                {
                  value: 'center',
                  icon: AlignCenter,
                  label: (
                    <span className="sr-only" lang="en">
                      {'Align to the center'}
                    </span>
                  ),
                },
                {
                  value: 'end',
                  icon: EndIcon,
                  label: (
                    <span className="sr-only" lang="en">
                      {'Align to the end'}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </div>
      )}
      {(kind === 'audio' || kind === 'video') && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              value={attributes.autoplay}
              onChange={(autoplay) => update({ autoplay: autoplay === true })}
            />
            {intl.formatMessage(messages.autoplay)}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              value={attributes.loop}
              onChange={(loop) => update({ loop: loop === true })}
            />
            {intl.formatMessage(messages.loop)}
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pick !== undefined && kind !== undefined && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void (async () => {
                const assetId = await pick(kind);
                if (assetId !== undefined) update({ assetId });
                // The browser took focus, and these controls went with it.
                returnToText();
              })();
            }}
          >
            {intl.formatMessage(RESOURCE_PICKER_COPY[kind].changeAction)}
          </Button>
        )}
        <Button type="button" size="sm" color="destructive" onClick={remove}>
          {intl.formatMessage(messages.remove)}
        </Button>
      </div>
    </div>
  );
}

/** Where the file itself is drawn, inside the box its block draws it in. */
type DrawnFile = Readonly<{
  /** Where it is drawn, from the box's top left corner. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** A picture's width over its height; `undefined` for an audio player. */
  ratio: number | undefined;
  /**
   * How far across the box the file sits: 0 against its left edge, 1 against
   * its right, 0.5 in the middle.
   */
  across: number;
}>;

const hasRatio = (drawn: DrawnFile): drawn is DrawnFile & { ratio: number } =>
  drawn.ratio !== undefined;

const sameDrawing = (
  one: DrawnFile | undefined,
  other: DrawnFile | undefined,
): boolean =>
  one === other ||
  (one !== undefined &&
    other !== undefined &&
    one.left === other.left &&
    one.top === other.top &&
    one.width === other.width &&
    one.height === other.height &&
    one.ratio === other.ratio &&
    one.across === other.across);

/**
 * Where `box` draws its file. An image or video held to a height is drawn
 * inside an element as wide as the page, so its picture is narrower than its
 * element, and sits where the element's `object-position` puts it. Nothing
 * until the file has said how large it is.
 */
const drawnFileIn = (box: HTMLElement): DrawnFile | undefined => {
  const media = box.querySelector('img, video, audio');
  if (media === null) return undefined;
  const outer = box.getBoundingClientRect();
  const element = media.getBoundingClientRect();
  if (media instanceof HTMLAudioElement) {
    return {
      left: element.left - outer.left,
      top: element.top - outer.top,
      width: element.width,
      height: element.height,
      ratio: undefined,
      across: 0.5,
    };
  }
  const [naturalWidth, naturalHeight] =
    media instanceof HTMLImageElement
      ? [media.naturalWidth, media.naturalHeight]
      : media instanceof HTMLVideoElement
        ? [media.videoWidth, media.videoHeight]
        : [0, 0];
  if (naturalWidth === 0 || naturalHeight === 0 || element.height === 0) {
    return undefined;
  }
  const ratio = naturalWidth / naturalHeight;
  const width = Math.min(element.width, element.height * ratio);
  const height = width / ratio;
  const position = Number.parseFloat(getComputedStyle(media).objectPosition);
  const across = Number.isFinite(position) ? position / 100 : 0.5;
  return {
    left: element.left - outer.left + (element.width - width) * across,
    top: element.top - outer.top + (element.height - height) / 2,
    width,
    height,
    ratio,
    across,
  };
};

/**
 * Where the box `ref` names draws its file, kept up as the box changes size
 * and as the file arrives.
 */
function useDrawnFile(
  ref: RefObject<HTMLDivElement | null>,
): DrawnFile | undefined {
  const [drawn, setDrawn] = useState<DrawnFile | undefined>(undefined);
  useLayoutEffect(() => {
    const box = ref.current;
    if (box === null) return undefined;
    const measure = () => {
      const next = drawnFileIn(box);
      setDrawn((current) => (sameDrawing(current, next) ? current : next));
    };
    measure();
    // A file says how large it is when it loads, and neither event bubbles.
    box.addEventListener('load', measure, true);
    box.addEventListener('loadedmetadata', measure, true);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(box);
    return () => {
      box.removeEventListener('load', measure, true);
      box.removeEventListener('loadedmetadata', measure, true);
      observer?.disconnect();
    };
  });
  return drawn;
}

/**
 * The size nearest to a height the researcher has dragged a picture to.
 * `heights` are what each size would draw the picture at, smallest size
 * first; where two draw it the same, the larger is the one meant, since it
 * is the one that goes on fitting if the picture is replaced by a larger.
 */
export const sizeNearest = (
  wanted: number,
  heights: readonly (readonly [SizeChoice, number])[],
): SizeChoice => {
  let nearest: SizeChoice = 'full';
  let distance = Number.POSITIVE_INFINITY;
  for (const [choice, height] of heights) {
    const away = Math.abs(height - wanted);
    if (away <= distance) {
      nearest = choice;
      distance = away;
    }
  }
  return nearest;
};

/**
 * The corner of a picture, dragged to change the size the picture is drawn
 * at. The size follows the pointer from one of the sizes on offer to the
 * next, and is the block's once the corner is let go.
 *
 * For a pointer only, and hidden from a screen reader: the same sizes are
 * offered, to the keyboard too, among the block's settings.
 */
function ResizeCorner({
  boxRef,
  drawn,
  size,
  onDrag,
  onDrop,
}: {
  boxRef: RefObject<HTMLDivElement | null>;
  drawn: DrawnFile & { ratio: number };
  size: SizeChoice;
  onDrag: (size: SizeChoice | undefined) => void;
  onDrop: (size: SizeChoice) => void;
}) {
  const intl = useAppIntl();
  const probeRef = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);
  // The corner that moves as the picture grows: a picture against the right
  // edge of its box grows to the left.
  const onLeft = drawn.across === 1;

  const sizeAt = (clientX: number, clientY: number): SizeChoice => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (box === null || probe === null) return size;
    const outer = box.getBoundingClientRect();
    const full = outer.width / drawn.ratio;
    // What each size holds a picture to, read from the classes that hold it.
    const heights = SIZES.map((choice): [Size, number] => {
      probe.className = cx('invisible absolute size-0', SIZE_CLASSES[choice]);
      const held = Number.parseFloat(getComputedStyle(probe).maxHeight);
      return [choice, Number.isFinite(held) ? Math.min(held, full) : full];
    });
    // As tall as the pointer is below the picture's top, and as wide as it is
    // from the side of the picture that stays where it is.
    const across = Math.abs(
      clientX - (outer.left + outer.width * drawn.across),
    );
    const wide = drawn.across === 0.5 ? across * 2 : across;
    const wanted = (clientY - (outer.top + drawn.top) + wide / drawn.ratio) / 2;
    return sizeNearest(wanted, [...heights, ['full', full]]);
  };

  return (
    <>
      <span ref={probeRef} aria-hidden />
      <div
        {...assetBlockControlsProps}
        aria-hidden
        data-asset-block-resize=""
        // 24px to take hold of, around the 16px that is drawn.
        className={cx(
          'pointer-events-auto absolute -bottom-3 size-6 touch-none',
          'before:bg-primary before:border-surface-1 before:absolute before:inset-1 before:rounded-full before:border-2',
          onLeft
            ? '-inset-s-3 cursor-nesw-resize'
            : '-inset-e-3 cursor-nwse-resize',
        )}
        // A press here is not one on the block, which would start moving it.
        onMouseDown={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          onDrag(size);
        }}
        onPointerMove={(event) => {
          if (dragging) onDrag(sizeAt(event.clientX, event.clientY));
        }}
        onPointerUp={(event) => {
          if (!dragging) return;
          setDragging(false);
          onDrop(sizeAt(event.clientX, event.clientY));
        }}
        onLostPointerCapture={() => {
          if (!dragging) return;
          setDragging(false);
          onDrag(undefined);
        }}
      />
      {dragging && (
        <span
          className={cx(
            'bg-primary text-primary-contrast absolute -bottom-9 rounded-sm px-2 py-0.5 text-xs font-bold whitespace-nowrap',
            onLeft ? 'inset-s-0' : 'inset-e-0',
          )}
        >
          {intl.formatMessage(SIZE_LABELS[size])}
        </span>
      )}
    </>
  );
}

const SETTINGS_COLLISIONS = {
  side: 'flip',
  align: 'shift',
  fallbackAxisSide: 'none',
} as const;

// The settings stay open for as long as the block is selected, so they keep
// clear of the top and bottom of the window: that is where a page keeps the
// bars a researcher still needs while they are open (its title, and the one
// that saves the stage), and a popup at the window's edge would cover them.
const SETTINGS_CLEARANCE = { top: 96, bottom: 96 } as const;

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
}: AssetBlockViewSource): ComponentType<RichTextAssetBlockViewProps> =>
  function AssetBlockView({
    attributes,
    selected,
    editable,
    active,
    update,
    remove,
    returnToText,
    pick,
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
    // The size the corner is being dragged to, while it is being dragged.
    const [dragged, setDragged] = useState<SizeChoice | undefined>(undefined);
    const size =
      dragged === undefined
        ? attributes.size
        : dragged === 'full'
          ? null
          : dragged;
    const working = selected && editable;
    const showsSettings = working && active && dragged === undefined;
    // Read as the settings are about to show, where it may since have changed.
    useLayoutEffect(() => {
      if (showsSettings && boxRef.current !== null) {
        setDirection(directionAt(boxRef.current));
      }
    }, [showsSettings]);

    return (
      <>
        <div
          ref={boxRef}
          className={cx(
            'relative',
            asset?.kind === 'audio' && 'flex',
            asset?.kind === 'audio' && JUSTIFY_CLASSES[attributes.align],
          )}
          data-drag-handle=""
          {...assetBlockControlsAt(settingsId)}
        >
          {asset === undefined ? (
            <Badge tone="warning">
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
                      size !== null && SIZE_CLASSES[size],
                      size !== null && POSITION_CLASSES[attributes.align],
                    )
              }
            />
          )}
          {drawn !== undefined && (
            // Where the file is drawn, for what belongs to the file rather
            // than to the box: its corner, and its settings.
            <div
              ref={fileRef}
              className="pointer-events-none absolute"
              style={{
                left: drawn.left,
                top: drawn.top,
                width: drawn.width,
                height: drawn.height,
              }}
            >
              {working && hasRatio(drawn) && (
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
            anchor={drawn === undefined ? boxRef : fileRef}
            side="bottom"
            // Under the file, or over it: never beside it, where it would
            // cover whatever the page has there.
            collisionAvoidance={SETTINGS_COLLISIONS}
            collisionPadding={SETTINGS_CLEARANCE}
            aria-labelledby={settingsNameId}
            // The caret stays on the block until Enter takes it in here, and
            // is the text's again when these go.
            initialFocus={false}
            finalFocus={false}
          >
            <span id={settingsNameId} className="sr-only" lang="en">
              {asset === undefined
                ? 'Block settings'
                : SETTINGS_NAMES[asset.kind]}
            </span>
            <AssetBlockSettings
              asset={asset}
              attributes={attributes}
              direction={direction}
              update={update}
              remove={remove}
              returnToText={returnToText}
              pick={pick}
            />
          </PopoverContent>
        </Popover>
      </>
    );
  };

const KIND_ICONS = { image: ImageIcon, audio: Volume2, video: Video } as const;

// A value the text shows inside a description is held, where text is drawn
// read-only, by a private-use character; a description is plain words.
const PRIVATE_USE = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;

/**
 * A file a text holds as a block, as one line: what kind of file it is, and
 * the words that name it. For places that name the file rather than draw it.
 */
export function AssetBlockLine({
  kind,
  name,
}: Readonly<{ kind: RichTextAssetBlockKind; name: string }>) {
  const Icon = KIND_ICONS[kind];
  return (
    <span data-asset-block={kind} className="my-1 flex items-center gap-2">
      <Icon aria-hidden className="size-4 flex-none" />
      <span className="sr-only" lang="en">
        {`${kind}: `}
      </span>
      <bdi>{name}</bdi>
    </span>
  );
}

/**
 * How text that is read rather than written (a cell of the translation
 * table, a summary) draws the files it holds as blocks: one line naming the
 * file by its description, or failing that by its name, marked with what
 * kind of file it is (`AssetBlockLine`). The file itself is not drawn: these
 * are places a text is read at a glance, many to a page, and a recording
 * that plays there would play in all of them.
 */
export const createAssetBlockImages = (
  useAsset: AssetBlockViewSource['useAsset'],
): MarkdownBlockImages => ({
  matches: isAssetBlockUrl,
  Block: function AssetBlockImage({ url, alt }) {
    const intl = useAppIntl();
    const assetId = readAssetBlockUrl(url)?.block.assetId ?? '';
    const asset = useAsset(assetId);
    const description = alt.replace(PRIVATE_USE, '').trim();
    if (asset === undefined) {
      return (
        <span data-asset-block="" className="my-1 flex items-center gap-2">
          <TriangleAlert aria-hidden className="size-4 flex-none" />
          <span>{intl.formatMessage(messages.unusable)}</span>
        </span>
      );
    }
    return (
      <AssetBlockLine
        kind={asset.kind}
        name={description === '' ? asset.name : description}
      />
    );
  },
});

const useStageAsset = (assetId: string): KnownAsset | undefined => {
  const asset = useProtocolContext().assets[assetId];
  if (asset === undefined || !isAssetBlockKind(asset.type)) return undefined;
  return { kind: asset.type, name: asset.name };
};

/** A block in a stage editor, drawn from the resources of the open edit. */
const StageAssetBlockView = createAssetBlockView({
  useAsset: useStageAsset,
  Preview: ({ assetId, kind, name, className }) => (
    <ResourcePreview
      resourceId={assetId}
      kind={kind}
      name={name}
      className={className}
    />
  ),
});

type PickRequest = Readonly<{
  kind: RichTextAssetBlockKind;
  resolve: (assetId: string | undefined) => void;
}>;

/**
 * What a text field in a stage editor gives its editor so the text can hold
 * files as blocks: `assetBlocks` for the editor, and `picker` to draw beside
 * it, which is the resource browser the editor's buttons open. Choosing a
 * file there, or importing one, puts it in the text; closing it puts nothing.
 *
 * `undefined` blocks when the field does not hold them (`enabled`), so a
 * field declared without blocks offers none.
 */
export function useStageAssetBlocks(enabled: boolean): Readonly<{
  assetBlocks: RichTextAssetBlocks | undefined;
  picker: ReactNode;
}> {
  const [request, setRequest] = useState<PickRequest | null>(null);
  const requestRef = useRef<PickRequest | null>(null);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  const settle = useCallback((assetId: string | undefined) => {
    requestRef.current?.resolve(assetId);
    requestRef.current = null;
    setRequest(null);
  }, []);

  // A field that goes away while its browser is open chose nothing.
  useEffect(() => () => requestRef.current?.resolve(undefined), []);

  const pick = useCallback(
    (kind: RichTextAssetBlockKind) =>
      new Promise<string | undefined>((resolve) => {
        // Asked again before answering: the earlier asking chose nothing.
        requestRef.current?.resolve(undefined);
        const next = { kind, resolve };
        requestRef.current = next;
        setRefusal(undefined);
        setRequest(next);
      }),
    [],
  );

  const assetBlocks = useMemo(
    (): RichTextAssetBlocks | undefined =>
      enabled ? { pick, View: StageAssetBlockView } : undefined,
    [enabled, pick],
  );

  return {
    assetBlocks,
    picker: enabled ? (
      <StageAssetBlockPicker
        request={request}
        refusal={refusal}
        onRefused={(message) => {
          setRefusal(message);
          settle(undefined);
        }}
        onSettled={settle}
      />
    ) : null,
  };
}

function StageAssetBlockPicker({
  request,
  refusal,
  onRefused,
  onSettled,
}: {
  request: PickRequest | null;
  refusal: string | undefined;
  onRefused: (message: string) => void;
  onSettled: (assetId: string | undefined) => void;
}) {
  const intl = useAppIntl();
  const resources = useResourceClient();
  // The kind last asked for, so the browser keeps its wording as it closes.
  const [lastKind, setLastKind] = useState<RichTextAssetBlockKind>('image');
  if (request !== null && request.kind !== lastKind) setLastKind(request.kind);
  const kind = request?.kind ?? lastKind;

  const handleSelect = (chosen: ResourceDescriptor) => {
    // The browser asks for the kind the button named, but a host may answer
    // with more than it was asked for, and a roster is not a file a page can
    // show.
    if (!acceptsResourceKind(kind, chosen.kind)) {
      onRefused(unsupportedResourceKindMessage(kind));
      return;
    }
    // Asked of the edit: another field may be discarding this very file, and
    // only the edit knows a discard is in flight.
    const reference = resources.referenceStaged(chosen.id);
    if (reference.status === 'failed') {
      onRefused(reference.failure.message);
      return;
    }
    onSettled(chosen.id);
  };

  return (
    <>
      <ResourceBrowserDialog
        open={request !== null}
        kind={kind}
        onSelect={handleSelect}
        onClose={() => onSettled(undefined)}
      />
      {refusal !== undefined && (
        <div role="alert" className="text-destructive-ink text-sm">
          {formatMessageError(refusal, intl) ?? refusal}
        </div>
      )}
    </>
  );
}
