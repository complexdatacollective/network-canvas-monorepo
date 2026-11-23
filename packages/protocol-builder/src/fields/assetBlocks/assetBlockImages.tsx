import {
  Image as ImageIcon,
  TriangleAlert,
  Video,
  Volume2,
} from 'lucide-react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { RichTextAssetBlockKind } from '@codaco/fresco-ui/form/fields/RichTextEditor';
import type { MarkdownBlockImages } from '@codaco/fresco-ui/RenderMarkdown';
import { useTokenPillLanguage } from '@codaco/fresco-ui/TokenPill';
import {
  isAssetBlockUrl,
  readAssetBlockUrl,
} from '@codaco/protocol-validation';

import { assetBlockDescription } from './assetBlockDescription.ts';
import { messages } from './assetBlockMessages.ts';
import type { AssetBlockViewSource } from './AssetBlockView.tsx';

const KIND_ICONS = { image: ImageIcon, audio: Volume2, video: Video } as const;

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
    // The interface's words, in a text in the language being translated or
    // summarized.
    const interfaceLanguage = useTokenPillLanguage();
    const assetId = readAssetBlockUrl(url)?.block.assetId ?? '';
    const asset = useAsset(assetId);
    const description = assetBlockDescription(alt);
    if (asset === undefined) {
      return (
        <span data-asset-block="" className="my-1 flex items-center gap-2">
          <TriangleAlert aria-hidden className="size-4 flex-none" />
          <span {...interfaceLanguage}>
            {intl.formatMessage(messages.unusable)}
          </span>
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
