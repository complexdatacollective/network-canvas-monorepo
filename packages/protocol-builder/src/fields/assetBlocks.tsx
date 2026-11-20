import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Image as ImageIcon,
  Trash2,
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
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  assetBlockControlsAt,
  assetBlockControlsProps,
  type RichTextAssetBlockAttributes,
  type RichTextAssetBlockKind,
  type RichTextAssetBlocks,
  type RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import { surfaceSpacingVariants } from '@codaco/fresco-ui/layout/Surface';
import { Popover, PopoverContent } from '@codaco/fresco-ui/Popover';
import type { MarkdownBlockImages } from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';
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
  unsupportedResourceKindMessage,
} from '../resources/components/resourceKinds.ts';
import ResourcePreview from '../resources/components/ResourcePreview.tsx';
import type { ResourceDescriptor } from '../resources/types.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import AssetPickerField from './AssetPickerField.tsx';

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
      'This is read aloud to participants who use screen reader technology. Leave it blank if the image is decorative.',
    description:
      'Guidance under the description control of an image placed in the text of a page. Decorative means the picture adds nothing a participant would miss.',
  },
  audioDescriptionHint: {
    id: 'protocolBuilder.contentBlock.audioDescriptionHint',
    defaultMessage:
      'This is read aloud, in place of the file’s name, to participants who use screen reader technology.',
    description:
      'Guidance under the description control of an audio recording placed in the text of a page.',
  },
  videoDescriptionHint: {
    id: 'protocolBuilder.contentBlock.videoDescriptionHint',
    defaultMessage:
      'This is read aloud, in place of the file’s name, to participants who use screen reader technology.',
    description:
      'Guidance under the description control of a video placed in the text of a page.',
  },
  sizeLabel: {
    id: 'protocolBuilder.assetBlock.sizeLabel',
    defaultMessage: 'Display size',
    description:
      'Label of the control, in the settings of an image or video placed in the text of a page, that chooses how tall it is drawn: Full size, Small, Medium or Large.',
  },
  sizeHint: {
    id: 'protocolBuilder.assetBlock.sizeHint',
    defaultMessage:
      'How tall this is shown on the page. Full size shows it at its natural height. You can also drag the handle at its corner.',
    description:
      'Guidance under the Display size control of an image or video placed in the text of a page. "This" is the image or video. The handle is a small round dot at a bottom corner of the selected image or video.',
  },
  alignLabel: {
    id: 'protocolBuilder.assetBlock.alignLabel',
    defaultMessage: 'Alignment',
    description:
      'Label of the control, in the settings of an image, audio recording or video placed in the text of a page, that chooses where it sits across the page: where a line of text starts, in the middle, or where a line ends.',
  },
  imageFileLabel: {
    id: 'protocolBuilder.assetBlock.imageFileLabel',
    defaultMessage: 'Image',
    description:
      'Label of the control, in the settings of an image placed in the text of a page, that shows which image file it is and lets another be chosen in its place.',
  },
  audioFileLabel: {
    id: 'protocolBuilder.assetBlock.audioFileLabel',
    defaultMessage: 'Audio',
    description:
      'Label of the control, in the settings of an audio recording placed in the text of a page, that shows which audio file it is and lets another be chosen in its place.',
  },
  videoFileLabel: {
    id: 'protocolBuilder.assetBlock.videoFileLabel',
    defaultMessage: 'Video',
    description:
      'Label of the control, in the settings of a video placed in the text of a page, that shows which video file it is and lets another be chosen in its place.',
  },
  fileHint: {
    id: 'protocolBuilder.assetBlock.fileHint',
    defaultMessage:
      'The file shown here. Choose another to replace it, and its settings are kept.',
    description:
      'Guidance under the control that shows which file an image, audio recording or video placed in the text of a page is, and lets another be chosen in its place. "Here" is this place in the text.',
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
    defaultMessage: 'Delete',
    description:
      'Button in the settings of an image, audio recording or video placed in the text of a page. It takes the image, recording or video out of the text; the file itself stays in the protocol.',
  },
});

const DESCRIPTION_HINTS = {
  image: messages.imageDescriptionHint,
  audio: messages.audioDescriptionHint,
  video: messages.videoDescriptionHint,
} as const;

const FILE_LABELS = {
  image: messages.imageFileLabel,
  audio: messages.audioFileLabel,
  video: messages.videoFileLabel,
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
  /**
   * Where a block's settings offer to replace its file. Without one, a block
   * keeps the file it has, and is deleted to be rid of it.
   */
  FileField?: AssetBlockFileField;
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

/**
 * A row of choices as a field's control: named by the field's label and
 * described by its hint, which the field hands it.
 */
function SegmentedField({
  id,
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: CreateFormFieldProps<
  string,
  'div',
  { options: SegmentedOption<string>[] }
>) {
  return (
    <SegmentedSwitcher<string>
      id={id}
      size="sm"
      value={value ?? ''}
      onValueChange={(next) => onChange?.(next)}
      options={options}
      aria-describedby={ariaDescribedBy}
      {...(ariaLabelledBy === undefined
        ? { 'aria-label': ariaLabel ?? '' }
        : { 'aria-labelledby': ariaLabelledBy })}
    />
  );
}

/**
 * A control that shows which file a block is and lets another be chosen in
 * its place: a field's control, given the kind of file the block is. It
 * answers with the id of the file chosen, or with nothing when the file is
 * to go.
 */
type AssetBlockFileField = ComponentType<
  CreateFormFieldProps<
    string,
    'div',
    {
      kind: RichTextAssetBlockKind;
      onBrowserOpenChange?: (open: boolean) => void;
    }
  >
>;

const isAlign = (value: string): value is Align =>
  value === 'start' || value === 'center' || value === 'end';

function AssetBlockSettings({
  asset,
  attributes,
  direction,
  update,
  remove,
  returnToText,
  FileField,
  onBrowserOpenChange,
}: Pick<
  RichTextAssetBlockViewProps,
  'attributes' | 'update' | 'remove' | 'returnToText'
> & {
  asset: KnownAsset | undefined;
  /** Told when the file field's resource browser opens and closes. */
  onBrowserOpenChange: (open: boolean) => void;
  /** The direction the text runs in where the block sits. */
  direction: 'ltr' | 'rtl';
  FileField: AssetBlockFileField | undefined;
}) {
  const intl = useAppIntl();
  const kind = asset?.kind;
  const [StartIcon, EndIcon] =
    direction === 'rtl' ? [AlignRight, AlignLeft] : [AlignLeft, AlignRight];

  // Each field is wrapped, so that each is the last in its parent: a field
  // otherwise keeps a wide space under itself. These keep the closer one
  // between them instead, so that the whole of them fits beside the block in
  // an ordinary window.
  return (
    <div className="flex w-[42rem] max-w-full flex-col gap-4">
      {kind !== undefined && (
        <div>
          <UnconnectedField
            name="description"
            component={InputField}
            label={intl.formatMessage(messages.descriptionLabel)}
            hint={intl.formatMessage(DESCRIPTION_HINTS[kind])}
            size="sm"
            value={attributes.description}
            onChange={(description) =>
              update({ description: description ?? '' })
            }
          />
        </div>
      )}
      {kind !== undefined &&
        (kind !== 'audio' || canBePlaced(kind, attributes.size)) && (
          // How large and where, side by side, their controls on one line;
          // one under the other where a language's words leave no room.
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            {kind !== 'audio' && (
              <div className="flex-1">
                <UnconnectedField
                  name="size"
                  component={SegmentedField}
                  label={intl.formatMessage(messages.sizeLabel)}
                  hint={intl.formatMessage(messages.sizeHint)}
                  value={attributes.size ?? 'full'}
                  onChange={(choice) => {
                    if (choice === undefined || !isSizeChoice(choice)) return;
                    update({ size: choice === 'full' ? null : choice });
                  }}
                  options={SIZE_CHOICES.map((value) => ({
                    value,
                    label: intl.formatMessage(SIZE_LABELS[value]),
                  }))}
                />
              </div>
            )}
            {canBePlaced(kind, attributes.size) && (
              <div className="flex-none">
                <UnconnectedField
                  name="align"
                  component={SegmentedField}
                  label={intl.formatMessage(messages.alignLabel)}
                  value={attributes.align}
                  onChange={(align) => {
                    if (align !== undefined && isAlign(align))
                      update({ align });
                  }}
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
              </div>
            )}
          </div>
        )}
      {(kind === 'audio' || kind === 'video') && (
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            <UnconnectedField
              name="autoplay"
              component={ToggleField}
              label={intl.formatMessage(messages.autoplay)}
              value={attributes.autoplay}
              onChange={(autoplay) => update({ autoplay: autoplay === true })}
            />
          </div>
          <div>
            <UnconnectedField
              name="loop"
              component={ToggleField}
              label={intl.formatMessage(messages.loop)}
              value={attributes.loop}
              onChange={(loop) => update({ loop: loop === true })}
            />
          </div>
        </div>
      )}
      {/* The file, and Delete on the line of its button: the last line of
          them, which takes the block away, file and all. */}
      <div className="flex flex-wrap items-end justify-end gap-x-3 gap-y-4">
        {kind !== undefined && FileField !== undefined && (
          <div className="min-w-0 flex-1 basis-80">
            <UnconnectedField
              name="file"
              component={FileField}
              label={intl.formatMessage(FILE_LABELS[kind])}
              hint={intl.formatMessage(messages.fileHint)}
              kind={kind}
              onBrowserOpenChange={onBrowserOpenChange}
              value={attributes.assetId}
              onChange={(assetId) => {
                // A block is its file: one whose file is taken away goes too.
                if (assetId === undefined || assetId === '') {
                  remove();
                  return;
                }
                if (assetId !== attributes.assetId) update({ assetId });
                // The browser took focus, and these controls went with it: the
                // block is drawn again for its new file.
                returnToText();
              }}
            />
          </div>
        )}
        <Button
          type="button"
          size="sm"
          color="destructive"
          icon={<Trash2 aria-hidden />}
          onClick={remove}
        >
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
 * How tall a picture is wanted, once its corner has been dragged by `across`
 * and `down` from where it was `tall`. A picture keeps its shape, so a move
 * either way says the same thing: the one that says the most is taken, which
 * lets the corner be pulled along either side of the picture as well as from
 * corner to corner.
 */
export const heightDraggedTo = (
  tall: number,
  moved: Readonly<{ across: number; down: number }>,
  ratio: number,
): number => {
  const fromWidth = moved.across / ratio;
  return (
    tall + (Math.abs(fromWidth) > Math.abs(moved.down) ? fromWidth : moved.down)
  );
};

/**
 * The corner of a block's box, dragged to change the size its picture is
 * drawn at. The size goes from one of the sizes on offer to the next as the
 * pointer moves, and is the block's once the corner is let go.
 *
 * At a bottom corner of the box, where it is whatever size the picture has
 * within it, and on the side the picture grows towards: a picture held against
 * the right of its box grows to the left.
 *
 * For a pointer only, and hidden from a screen reader: the same sizes are
 * offered, to the keyboard too, among the block's settings.
 */
// Where the corner's middle goes, out from the box: on the line the editor
// outlines a selected block with, which is drawn 4px outside it and 2px wide
// (`outline-offset-4 outline-2` on the block), less half the 24px corner.
const CORNER_OFFSET = -(4 + 2 / 2 + 24 / 2);

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
  // Where the pointer took hold, and how tall the picture was then.
  const [held, setHeld] = useState<
    Readonly<{ x: number; y: number; tall: number }> | undefined
  >(undefined);
  const onLeft = drawn.across === 1;

  const sizeAt = (clientX: number, clientY: number): SizeChoice => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (box === null || probe === null || held === undefined) return size;
    const full = box.getBoundingClientRect().width / drawn.ratio;
    // What each size holds a picture to, read from the classes that hold it.
    const heights = SIZES.map((choice): [Size, number] => {
      probe.className = cx('invisible absolute size-0', SIZE_CLASSES[choice]);
      const limit = Number.parseFloat(getComputedStyle(probe).maxHeight);
      return [choice, Number.isFinite(limit) ? Math.min(limit, full) : full];
    });
    const wanted = heightDraggedTo(
      held.tall,
      {
        // Away from the side the picture is held against is larger.
        across: (clientX - held.x) * (onLeft ? -1 : 1),
        down: clientY - held.y,
      },
      drawn.ratio,
    );
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
          'pointer-events-auto absolute size-6 touch-none',
          'before:bg-primary before:border-surface-1 before:absolute before:inset-1 before:rounded-full before:border-2',
          onLeft ? 'cursor-nesw-resize' : 'cursor-nwse-resize',
        )}
        // Where the picture is drawn is measured from the left of its box,
        // whichever way the text runs, so the corner is placed from the left
        // or the right too: a side named for where a line starts would be the
        // other one in right-to-left text.
        style={
          onLeft
            ? { left: CORNER_OFFSET, bottom: CORNER_OFFSET }
            : { right: CORNER_OFFSET, bottom: CORNER_OFFSET }
        }
        // A press here is not one on the block, which would start moving it.
        onMouseDown={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setHeld({ x: event.clientX, y: event.clientY, tall: drawn.height });
          onDrag(size);
        }}
        onPointerMove={(event) => {
          if (held !== undefined) onDrag(sizeAt(event.clientX, event.clientY));
        }}
        onPointerUp={(event) => {
          if (held === undefined) return;
          setHeld(undefined);
          onDrop(sizeAt(event.clientX, event.clientY));
        }}
        onLostPointerCapture={() => {
          if (held === undefined) return;
          setHeld(undefined);
          onDrag(undefined);
        }}
      />
      {held !== undefined && (
        <span
          className="bg-primary text-primary-contrast elevation-low absolute bottom-3 rounded-sm px-2 py-0.5 text-xs font-bold whitespace-nowrap"
          // Inside the box, by the corner, where it covers the picture or
          // the empty side of its box and never the text after it. On the
          // corner's side, by the same measure.
          style={onLeft ? { left: 12 } : { right: 12 }}
        >
          {intl.formatMessage(SIZE_LABELS[size])}
        </span>
      )}
    </>
  );
}

// The settings stay open for as long as the block is selected, so they keep
// clear of the top and bottom of the page the block scrolls in: that is where
// a page keeps the bars a researcher still needs while they are open (its
// title, and the one that saves the stage), and a popup at the edge would
// cover them. Architect's are 88 pixels down from the top of its page and 82
// up from the bottom; each is kept clear by 8 more.
const SETTINGS_CLEARANCE = { top: 96, bottom: 90 } as const;

// How far the settings stand from the file: the popover's own distance.
const SETTINGS_OFFSET = 10;

/**
 * What the page a block is in scrolls inside: the nearest box around it that
 * scrolls, or nothing where the window itself does. Below whatever an app
 * shows above its pages, such as a banner, so the settings keep inside it.
 */
const scrollerOf = (element: Element): Element | undefined => {
  for (
    let at = element.parentElement;
    at !== null && at !== element.ownerDocument.body;
    at = at.parentElement
  ) {
    if (/auto|scroll/.test(getComputedStyle(at).overflowY)) return at;
  }
  return undefined;
};

/** The part of the window `scroller` shows, or the whole window. */
const roomIn = (scroller: Element | undefined) => {
  const box = scroller?.getBoundingClientRect();
  return {
    top: Math.max(box?.top ?? 0, 0),
    bottom: Math.min(box?.bottom ?? window.innerHeight, window.innerHeight),
  };
};

/**
 * Which side of the file its settings stand on, and whether they may cover
 * part of it to be seen whole.
 */
type SettingsPlacement = Readonly<{
  side: 'top' | 'bottom';
  overlaps: boolean;
}>;

/**
 * Under the file where the whole of its settings fits there, over it where
 * they fit there instead. Where they fit on neither side, on the side with
 * more room, moved over the file as far as they must be to be seen whole:
 * covering some of the file the researcher has just selected is better than
 * settings that have to be scrolled to be read. Never beside it, where they
 * would cover whatever the page has there.
 *
 * `room` is the part of the window the page is seen in, `tall` how tall the
 * whole of the settings is.
 */
export const settingsPlacement = (
  file: Readonly<{ top: number; bottom: number }>,
  tall: number,
  room: Readonly<{ top: number; bottom: number }>,
): SettingsPlacement => {
  const below =
    room.bottom - SETTINGS_CLEARANCE.bottom - file.bottom - SETTINGS_OFFSET;
  const above = file.top - room.top - SETTINGS_CLEARANCE.top - SETTINGS_OFFSET;
  if (below >= tall) return { side: 'bottom', overlaps: false };
  if (above >= tall) return { side: 'top', overlaps: false };
  return { side: below >= above ? 'bottom' : 'top', overlaps: true };
};

const samePlacement = (one: SettingsPlacement, other: SettingsPlacement) =>
  one.side === other.side && one.overlaps === other.overlaps;

/**
 * Where a block's settings stand (`settingsPlacement`), kept up while they
 * are open as the page scrolls, the window changes size and the settings
 * change height. `panel` is what scrolls inside them, whose full height is
 * theirs; `scroller` what the page scrolls in.
 */
function useSettingsPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panel: HTMLElement | null,
  scroller: Element | undefined,
): SettingsPlacement {
  const [placement, setPlacement] = useState<SettingsPlacement>({
    side: 'bottom',
    overlaps: false,
  });
  useLayoutEffect(() => {
    if (!open || panel === null) return undefined;
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const anchor = anchorRef.current;
      if (anchor === null) return;
      // What the settings hold, and the border of the popup around them.
      const border = 2;
      const next = settingsPlacement(
        anchor.getBoundingClientRect(),
        panel.scrollHeight + border,
        roomIn(scroller),
      );
      setPlacement((current) =>
        samePlacement(current, next) ? current : next,
      );
    };
    const schedule = () => {
      frame ??= requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', schedule);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(schedule);
    for (const child of panel.children) observer?.observe(child);
    if (anchorRef.current !== null) observer?.observe(anchorRef.current);
    if (scroller !== undefined) observer?.observe(scroller);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [open, anchorRef, panel, scroller]);
  return placement;
}

// On the side chosen for them, moved along the line of the page to stay in
// the window; and, where they must cover the file, moved over it.
const SETTINGS_COLLISIONS = {
  beside: { side: 'none', align: 'shift', fallbackAxisSide: 'none' },
  over: { side: 'shift', align: 'shift', fallbackAxisSide: 'none' },
} as const;

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
    const showsSettings = working && active && dragged === undefined;
    // What the page scrolls in, which the settings keep inside.
    const [scroller, setScroller] = useState<Element | undefined>(undefined);
    // Both read as the settings are about to show, where they may since have
    // changed.
    useLayoutEffect(() => {
      if (showsSettings && boxRef.current !== null) {
        setDirection(directionAt(boxRef.current));
        setScroller(scrollerOf(boxRef.current));
      }
    }, [showsSettings]);
    // What the settings stand beside: the file where it is drawn, or the
    // block's box until it is.
    const anchorRef = drawn === undefined ? boxRef : fileRef;
    // What scrolls inside the settings, should the window be too short for
    // them: its full height is theirs.
    const [panel, setPanel] = useState<HTMLElement | null>(null);
    const placement = useSettingsPlacement(
      showsSettings && !browsing,
      anchorRef,
      panel,
      scroller,
    );

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
            collisionPadding={SETTINGS_CLEARANCE}
            {...(scroller === undefined ? {} : { collisionBoundary: scroller })}
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

/**
 * The resource picker, as the settings of a block in a stage editor offer it:
 * without its own discard, since the settings delete the block, and on one
 * line, without a second drawing of the file, which the block draws just
 * above.
 */
const StageAssetBlockFileField: AssetBlockFileField = (props) => (
  <AssetPickerField {...props} discardable={false} compact />
);

/** A block in a stage editor, drawn from the resources of the open edit. */
const StageAssetBlockView = createAssetBlockView({
  FileField: StageAssetBlockFileField,
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
