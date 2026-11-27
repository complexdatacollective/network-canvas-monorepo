import { type ComponentType, useLayoutEffect, useRef, useState } from 'react';

import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';
import {
  assetBlockAudioRowVariants,
  assetBlockMediaVariants,
} from '@codaco/fresco-ui/assetBlockLayout';
import { Badge } from '@codaco/fresco-ui/Badge';
import {
  assetBlockFileProps,
  blockBoxProps,
  BlockTab,
  type RichTextAssetBlockKind,
  type RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { useInterfaceLanguage } from '@codaco/fresco-ui/interfaceLanguage';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { BlockSettingsPopover, directionAt } from '../BlockSettingsPopover.tsx';
import { messages, SIZE_LABELS } from './assetBlockMessages.ts';
import {
  AssetBlockSettings,
  type AssetBlockFileField,
} from './AssetBlockSettings.tsx';
import { hasRatio, useDrawnFile } from './drawnFile.ts';
import { type Box, PLAYER_CONTROLS_HEIGHT } from './settingsPlacement.ts';

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
 * pointer is over the block, or the block is selected, its tab shows the
 * settings button, and the settings (`AssetBlockSettings`) open from it,
 * attached to it, never covering a player's controls or the handle that
 * resizes a picture. While the block is selected, the editor's resize handle
 * (`resizeHandle`) sits on the bottom corner of a picture, and while it is
 * dragged the picture follows the pointer, with the size it would take named
 * beside the handle. A press on the file selects the
 * block, and a player's controls work whether or not it is selected. A block
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
    hovered,
    editable,
    active,
    update,
    resizeHandle,
    resizing,
    remove,
    returnToText,
    selectKeepingFocus,
  }) {
    const intl = useAppIntl();
    const asset = useAsset(attributes.assetId);
    const boxRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLDivElement>(null);
    const drawn = useDrawnFile(boxRef);
    // The direction of the text, which the block's description is typed in,
    // and not the interface's: a page written in Arabic is edited from an
    // English interface, and the other way about. Read at the block, since
    // the settings stand over the page and not in the text.
    const appDirection = useAppDirection();
    const [direction, setDirection] = useState(appDirection);
    // And the text's language, which the block's description is written in,
    // while the settings it is typed into stand over the page, outside the
    // text.
    const [language, setLanguage] = useState<string | undefined>(undefined);
    // What the block says in the interface's own words, inside text in the
    // language being written.
    const interfaceLanguage = useInterfaceLanguage();
    // Whether the settings are open: only from their button.
    const [open, setOpen] = useState(false);
    // Whether the file field's resource browser is open. The settings stand
    // on a layer above every dialog, so they are hidden while it is, or they
    // would cover the files to choose from. Hidden, not closed: the browser
    // belongs to the field inside them, and goes when they are taken away.
    const [browsing, setBrowsing] = useState(false);
    // The settings close as the block stops being selected (a press in the
    // text elsewhere), unless what they opened is in use: they then close as
    // it does.
    const [wasSelected, setWasSelected] = useState(selected);
    if (selected !== wasSelected) {
      setWasSelected(selected);
      if (!selected && !browsing) setOpen(false);
    }
    const settingsOpen = open && editable;
    // The tab (and its settings button) shows while the pointer is over the
    // block, while it is selected and being worked on, and while its
    // settings are open.
    const showsTab =
      editable && (hovered || (selected && active) || settingsOpen);
    // Both read as the settings are about to open, where they may since have
    // changed.
    useLayoutEffect(() => {
      if (settingsOpen && boxRef.current !== null) {
        setDirection(directionAt(boxRef.current));
        setLanguage(languageAt(boxRef.current));
      }
    }, [settingsOpen]);
    // What the settings never cover: the resize handle, and a player's
    // controls (the bar along the bottom of a video; all of an audio
    // player).
    const keepOut = (): Box[] => {
      const parts: Box[] = [];
      const corner = boxRef.current
        ?.querySelector('[data-asset-block-resize]')
        ?.getBoundingClientRect();
      if (corner !== undefined) parts.push(corner);
      const file = (fileRef.current ?? boxRef.current)?.getBoundingClientRect();
      if (file !== undefined && asset?.kind === 'audio') parts.push(file);
      if (file !== undefined && asset?.kind === 'video') {
        parts.push({
          top: Math.max(file.top, file.bottom - PLAYER_CONTROLS_HEIGHT),
          bottom: file.bottom,
          left: file.left,
          right: file.right,
        });
      }
      return parts;
    };
    const boxed = asset !== undefined && asset.kind !== 'audio';
    const tab = showsTab && (
      <BlockTab selected={selected && active}>
        <BlockSettingsPopover
          name={
            asset === undefined ? 'Block settings' : SETTINGS_NAMES[asset.kind]
          }
          open={settingsOpen}
          onOpenChange={setOpen}
          select={selectKeepingFocus}
          keepOut={keepOut}
          hidden={browsing || resizing !== undefined}
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
            onBrowserOpenChange={(next) => {
              setBrowsing(next);
              if (!next && !selected) setOpen(false);
            }}
          />
        </BlockSettingsPopover>
      </BlockTab>
    );

    return (
      <div
        ref={boxRef}
        className={cx(
          'relative',
          asset?.kind === 'audio' && assetBlockAudioRowVariants(),
        )}
        {...assetBlockFileProps}
        // Until the file is drawn, its frame goes round the whole block.
        {...(drawn === undefined && blockBoxProps(false))}
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
                : // Drawn as the interview draws it, with the smaller
                  // corners of a boxed block. While the handle is dragged,
                  // it is held to the height it is dragged to.
                  assetBlockMediaVariants({
                    ...(resizing === undefined
                      ? { size: attributes.size ?? undefined }
                      : { dragged: true }),
                    className: 'rounded-sm',
                  })
            }
          />
        )}
        {drawn === undefined ? (
          tab
        ) : (
          // Where the file is drawn, which its frame and tab are drawn
          // round: a small picture in a wide box has them round itself.
          <div
            ref={fileRef}
            className="pointer-events-none absolute"
            style={{
              left: drawn.left,
              top: drawn.top,
              width: drawn.width,
              height: drawn.height,
            }}
            {...blockBoxProps(boxed)}
          >
            {tab}
            {/* On the corner of the frame drawn round a picture. */}
            {boxed && hasRatio(drawn) && resizeHandle}
            {resizing !== undefined && (
              <span
                {...interfaceLanguage}
                className="bg-primary text-primary-contrast elevation-low absolute end-3 bottom-3 rounded-sm px-2 py-0.5 text-xs font-bold whitespace-nowrap"
              >
                {intl.formatMessage(SIZE_LABELS[resizing.size ?? 'full'])}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };
