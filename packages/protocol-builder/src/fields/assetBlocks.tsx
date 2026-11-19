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
  useCallback,
  useEffect,
  useId,
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
  assetBlockControlsProps,
  type RichTextAssetBlockAttributes,
  type RichTextAssetBlockKind,
  type RichTextAssetBlocks,
  type RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
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
type Align = RichTextAssetBlockAttributes['align'];

const isSizeChoice = (value: string): value is SizeChoice =>
  value === 'full' ||
  value === 'small' ||
  value === 'medium' ||
  value === 'large';

function AssetBlockSettings({
  asset,
  attributes,
  update,
  remove,
  returnToText,
  pick,
}: Pick<
  RichTextAssetBlockViewProps,
  'attributes' | 'update' | 'remove' | 'returnToText' | 'pick'
> & { asset: KnownAsset | undefined }) {
  const intl = useAppIntl();
  const direction = useAppDirection();
  const descriptionId = useId();
  const hintId = useId();
  const kind = asset?.kind;
  const [StartIcon, EndIcon] =
    direction === 'rtl' ? [AlignRight, AlignLeft] : [AlignLeft, AlignRight];

  return (
    <div
      {...assetBlockControlsProps}
      className="bg-surface-1 text-surface-1-contrast mt-2 flex flex-col gap-3 rounded-sm p-3"
      onKeyDown={(event) => {
        // Out of the controls and back to the block they belong to.
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        returnToText();
      }}
    >
      {kind !== undefined && (
        <div className="flex flex-col gap-1">
          <label htmlFor={descriptionId} className="text-sm font-bold">
            {intl.formatMessage(messages.descriptionLabel)}
          </label>
          <InputField
            id={descriptionId}
            name={descriptionId}
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {(kind === 'image' || kind === 'video') && (
          <SegmentedSwitcher<SizeChoice>
            size="sm"
            aria-label="Display size"
            value={attributes.size ?? 'full'}
            onValueChange={(choice) => {
              if (!isSizeChoice(choice)) return;
              update({ size: choice === 'full' ? null : choice });
            }}
            options={[
              { value: 'full', label: intl.formatMessage(messages.sizeFull) },
              { value: 'small', label: intl.formatMessage(messages.sizeSmall) },
              {
                value: 'medium',
                label: intl.formatMessage(messages.sizeMedium),
              },
              { value: 'large', label: intl.formatMessage(messages.sizeLarge) },
            ]}
          />
        )}
        {kind !== undefined && canBePlaced(kind, attributes.size) && (
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
        {(kind === 'audio' || kind === 'video') && (
          <>
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
          </>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {pick !== undefined && kind !== undefined && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void (async () => {
                  const assetId = await pick(kind);
                  if (assetId !== undefined) update({ assetId });
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
    </div>
  );
}

/**
 * How a block is drawn in the text of a page being written: the file as the
 * participant will meet it, at the size and place it is given, and, while
 * the block is selected, what changes those (`AssetBlockSettings`). A block
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
    update,
    remove,
    returnToText,
    pick,
  }) {
    const intl = useAppIntl();
    const asset = useAsset(attributes.assetId);

    return (
      <>
        {asset === undefined ? (
          <Badge tone="warning">{intl.formatMessage(messages.unusable)}</Badge>
        ) : (
          <div
            className={cx(
              asset.kind === 'audio' && 'flex',
              asset.kind === 'audio' && JUSTIFY_CLASSES[attributes.align],
            )}
            data-drag-handle=""
          >
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
                      attributes.size !== null && SIZE_CLASSES[attributes.size],
                      attributes.size !== null &&
                        POSITION_CLASSES[attributes.align],
                    )
              }
            />
          </div>
        )}
        {selected && editable && (
          <AssetBlockSettings
            asset={asset}
            attributes={attributes}
            update={update}
            remove={remove}
            returnToText={returnToText}
            pick={pick}
          />
        )}
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
