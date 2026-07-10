import { connect } from 'react-redux';

import type { RootState } from '~/ducks/modules/root';
import { getCodebook } from '~/selectors/protocol';

const mapStateToProps = (state: RootState) => ({
  codebook: getCodebook(state),
});

const withStoreConnector = connect(mapStateToProps);

export default withStoreConnector;
