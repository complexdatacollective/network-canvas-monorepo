import PropTypes from "prop-types";
import { Markdown } from "~/lib/legacy-ui/components/Fields";

const PromptPreview = ({ text }) => <Markdown label={text} />;

PromptPreview.propTypes = {
	text: PropTypes.string.isRequired,
};

export default PromptPreview;
