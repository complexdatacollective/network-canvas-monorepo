import { get } from 'es-toolkit/compat';
import { connect } from 'react-redux';

import { ALLOWED_MARKDOWN_SECTION_TAGS } from '@codaco/fresco-ui/RenderMarkdown';
import Markdown from '~/components/Markdown';
import type { RootState } from '~/ducks/modules/root';
import { getAssetManifest } from '~/selectors/protocol';

import AudioWithUrl from '../../Assets/Audio';
import BackgroundImageWithUrl from '../../Assets/BackgroundImage';
import VideoWithUrl from '../../Assets/Video';

const ITEM_PREVIEW_ALLOWED_ELEMENTS = ALLOWED_MARKDOWN_SECTION_TAGS.filter(
  (tag) => tag !== 'a',
);

type ItemPreviewProps = {
  content?: string | null;
  assetType?: string | null;
};

const mapStateToProps = (
  state: RootState,
  { content }: { content: string },
) => {
  const assetManifest = getAssetManifest(state);

  const assetType = get(assetManifest, [content, 'type']);

  return {
    assetType,
  };
};

const ItemPreview = ({
  content = null,
  assetType = null,
}: ItemPreviewProps) => {
  switch (assetType) {
    case 'image':
      return <BackgroundImageWithUrl id={content ?? ''} />;
    case 'video':
      return <VideoWithUrl id={content ?? ''} controls />;
    case 'audio':
      return <AudioWithUrl id={content ?? ''} controls />;
    default:
      return (
        <Markdown
          label={content ?? ''}
          allowedElements={ITEM_PREVIEW_ALLOWED_ELEMENTS}
          className="[&_li]:my-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-7 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-7"
        />
      );
  }
};

export default connect(mapStateToProps)(ItemPreview);
