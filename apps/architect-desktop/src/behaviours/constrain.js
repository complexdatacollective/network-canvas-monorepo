import PropTypes from "prop-types";
import { withContext } from "recompose";

const constrain = (constraints) => withContext({ constraints: PropTypes.array }, () => ({ constraints }));

export default constrain;
