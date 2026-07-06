import { get } from 'es-toolkit/compat';
import { connect } from 'react-redux';

import { Markdown } from '~/components/Form/Fields';
import type { RootState } from '~/ducks/modules/root';
import { getAssetManifest } from '~/selectors/protocol';

import AudioWithUrl from '../../Assets/Audio';
import BackgroundImageWithUrl from '../../Assets/BackgroundImage';
import VideoWithUrl from '../../Assets/Video';

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
          className="[&_li]:my-(--space-xs) [&_ol]:my-(--space-md) [&_ol]:list-decimal [&_ol]:pl-(--space-lg) [&_ul]:my-(--space-md) [&_ul]:list-disc [&_ul]:pl-(--space-lg)"
        />
      );
  }
};

export default connect(mapStateToProps)(ItemPreview);
