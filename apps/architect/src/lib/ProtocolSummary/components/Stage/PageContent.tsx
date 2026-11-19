import { type ComponentProps, useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { MarkdownBlockImages } from '@codaco/fresco-ui/RenderMarkdown';
import {
  isAssetBlockKind,
  isAssetBlockUrl,
  type LocalizedString,
  readAssetBlockUrl,
} from '@codaco/protocol-validation';
import { formatAssetType } from '~/components/Assets/assetMetadataMessages';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from '../DualLink';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import { SummaryMarkdown } from '../SummaryText';
import SectionFrame from './SectionFrame';

const messages = defineMessages({
  pageContent: {
    id: 'architect.protocolSummary.stage.pageContent.pageContent',
    defaultMessage: 'Page Content',
    description:
      'Section heading in the printable protocol summary, above the text of an Information stage: the one text, with its headings and the images, audio recordings and videos placed in it, that the stage shows participants as a page.',
  },
  fileNotFound: {
    id: 'architect.protocolSummary.stage.pageContent.fileNotFound',
    defaultMessage:
      'A file placed here is not among this protocol’s resources, or is not an image, audio recording or video.',
    description:
      'Shown in the printable protocol summary, within the text of an Information stage, in place of an image, audio recording or video placed in that text, when the file it names is missing from the protocol or is a kind of file a page cannot show.',
  },
  description: {
    id: 'architect.protocolSummary.stage.pageContent.description',
    defaultMessage: 'Description',
    description:
      'Label in the printable protocol summary, in the details of an image, audio recording or video placed in the text of an Information stage. Beside it are the words the researcher wrote to describe the file for a participant who cannot see or hear it.',
  },
  sizeSmall: {
    id: 'architect.protocolSummary.stage.pageContent.sizeSmall',
    defaultMessage: 'Small',
    description:
      'Value in the printable protocol summary, beside the label for the display size of an image or video placed in the text of an Information stage.',
  },
  sizeMedium: {
    id: 'architect.protocolSummary.stage.pageContent.sizeMedium',
    defaultMessage: 'Medium',
    description:
      'Value in the printable protocol summary, beside the label for the display size of an image or video placed in the text of an Information stage.',
  },
  sizeLarge: {
    id: 'architect.protocolSummary.stage.pageContent.sizeLarge',
    defaultMessage: 'Large',
    description:
      'Value in the printable protocol summary, beside the label for the display size of an image or video placed in the text of an Information stage.',
  },
  position: {
    id: 'architect.protocolSummary.stage.pageContent.position',
    defaultMessage: 'Position',
    description:
      'Label in the printable protocol summary, in the details of an image, audio recording or video placed in the text of an Information stage. Beside it is where the file sits across the page: at the side a line of text starts, in the middle, or at the side a line ends.',
  },
  positionStart: {
    id: 'architect.protocolSummary.stage.pageContent.positionStart',
    defaultMessage: 'Where a line of text starts',
    description:
      'Value in the printable protocol summary, beside the label for where a file sits across the page of an Information stage: at the side a line of text starts (the left in English, the right in Arabic).',
  },
  positionEnd: {
    id: 'architect.protocolSummary.stage.pageContent.positionEnd',
    defaultMessage: 'Where a line of text ends',
    description:
      'Value in the printable protocol summary, beside the label for where a file sits across the page of an Information stage: at the side a line of text ends (the right in English, the left in Arabic).',
  },
  playback: {
    id: 'architect.protocolSummary.stage.pageContent.playback',
    defaultMessage: 'Playback',
    description:
      'Label in the printable protocol summary, in the details of an audio recording or video placed in the text of an Information stage. Beside it is how the recording plays: whether it starts by itself, and whether it repeats.',
  },
  playsAutomaticallyRepeating: {
    id: 'architect.protocolSummary.stage.pageContent.playsAutomaticallyRepeating',
    defaultMessage: 'Starts automatically and repeats',
    description:
      'Value in the printable protocol summary, beside the label for how an audio recording or video on an Information stage plays: it starts by itself when the participant reaches the page, and starts again each time it ends.',
  },
  playsAutomaticallyOnce: {
    id: 'architect.protocolSummary.stage.pageContent.playsAutomaticallyOnce',
    defaultMessage: 'Starts automatically and plays once',
    description:
      'Value in the printable protocol summary, beside the label for how an audio recording or video on an Information stage plays: it starts by itself when the participant reaches the page, and stops when it ends.',
  },
  playsWhenStartedRepeating: {
    id: 'architect.protocolSummary.stage.pageContent.playsWhenStartedRepeating',
    defaultMessage: 'Started by the participant, then repeats',
    description:
      'Value in the printable protocol summary, beside the label for how an audio recording or video on an Information stage plays: the participant starts it, and it then starts again each time it ends.',
  },
  playsWhenStartedOnce: {
    id: 'architect.protocolSummary.stage.pageContent.playsWhenStartedOnce',
    defaultMessage: 'Started by the participant, and plays once',
    description:
      'Value in the printable protocol summary, beside the label for how an audio recording or video on an Information stage plays: the participant starts it, and it stops when it ends.',
  },
});

const SIZE_MESSAGES = {
  small: messages.sizeSmall,
  medium: messages.sizeMedium,
  large: messages.sizeLarge,
} as const;

// A value the text shows inside a description is held, where the summary
// draws text that shows values, by a private-use character.
const PRIVATE_USE = /[-\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;

type AssetData = { name?: string; type?: string };

/**
 * A file placed in a page's text, where the summary prints that text: which
 * file it is, linked to its entry among the protocol's resources, where its
 * preview is, and how the page shows it.
 */
const PageContentFile = ({
  url,
  alt,
}: ComponentProps<MarkdownBlockImages['Block']>) => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);
  const block = readAssetBlockUrl(url)?.block;
  // Looked up by the id as written: an id may hold a dot or a bracket, which
  // a path would read as a way into the entry.
  const manifest: Record<string, AssetData | undefined> =
    protocol.assetManifest ?? {};
  const data =
    block !== undefined && Object.hasOwn(manifest, block.assetId)
      ? manifest[block.assetId]
      : undefined;

  if (
    block === undefined ||
    data === undefined ||
    !isAssetBlockKind(data.type)
  ) {
    return (
      <div className="my-2 italic">
        {intl.formatMessage(messages.fileNotFound)}
      </div>
    );
  }

  const description = alt.replace(PRIVATE_USE, '').trim();
  const plays = data.type !== 'image';
  const autoplay = block.autoplay !== false;
  const loop = block.loop !== false;
  // An image or video with no size is as wide as the page, so it has nowhere
  // else to sit; an audio player always has room around it.
  const placed =
    block.align !== undefined &&
    (data.type === 'audio' || block.size !== undefined);

  return (
    <div data-asset-block={data.type} className="my-2">
      <MiniTable
        rotated
        rows={[
          [
            intl.formatMessage(summaryMessages.type),
            formatAssetType(data.type, intl),
          ],
          [
            intl.formatMessage(summaryMessages.name),
            <DualLink key="name" to={`#asset-${block.assetId}`}>
              <bdi>{data.name}</bdi>
            </DualLink>,
          ],
          ...(description === ''
            ? []
            : [[intl.formatMessage(messages.description), description]]),
          ...(block.size === undefined || data.type === 'audio'
            ? []
            : [
                [
                  intl.formatMessage(summaryMessages.blockSize),
                  intl.formatMessage(SIZE_MESSAGES[block.size]),
                ],
              ]),
          ...(placed
            ? [
                [
                  intl.formatMessage(messages.position),
                  intl.formatMessage(
                    block.align === 'start'
                      ? messages.positionStart
                      : messages.positionEnd,
                  ),
                ],
              ]
            : []),
          ...(plays
            ? [
                [
                  intl.formatMessage(messages.playback),
                  intl.formatMessage(
                    autoplay
                      ? loop
                        ? messages.playsAutomaticallyRepeating
                        : messages.playsAutomaticallyOnce
                      : loop
                        ? messages.playsWhenStartedRepeating
                        : messages.playsWhenStartedOnce,
                  ),
                ],
              ]
            : []),
        ]}
      />
    </div>
  );
};

const PAGE_CONTENT_FILES: MarkdownBlockImages = {
  matches: isAssetBlockUrl,
  Block: PageContentFile,
};

type PageContentProps = {
  content?: LocalizedString | null;
};

/**
 * The page an Information stage shows: its one text, in every language of
 * the protocol, with each file placed in it described where it sits.
 */
const PageContent = ({ content = null }: PageContentProps) => {
  const intl = useAppIntl();
  if (!content) return null;
  return (
    <SectionFrame title={intl.formatMessage(messages.pageContent)}>
      {/* A page opens with its heading, which has no space of its own above
          it, so the frame's would leave it against the section's title. */}
      <div className="mt-3">
        <SummaryMarkdown value={content} blockImages={PAGE_CONTENT_FILES} />
      </div>
    </SectionFrame>
  );
};

export default PageContent;
