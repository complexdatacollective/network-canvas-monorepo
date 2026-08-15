import { get } from 'es-toolkit/compat';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';

import type { RootState } from '~/ducks/modules/root';
import { getDisplayAssetManifest } from '~/selectors/protocol';

const existingMeta = {
  name: 'Interview network',
};

type OwnProps = {
  id: string;
};

type WithMetaProps = {
  meta: {
    name: string;
  };
};

const mapStateToProps = (state: RootState, { id }: OwnProps) => {
  // Feeds the selected-resource thumbnails and the preview dialog's title, so
  // it names the resource the same way its card in the library does.
  const assetManifest = getDisplayAssetManifest(state);
  const meta = get(assetManifest, id, existingMeta);

  return {
    meta,
  };
};

const withAssetMeta = compose<WithMetaProps & OwnProps, OwnProps>(
  connect(mapStateToProps),
);

export default withAssetMeta;
