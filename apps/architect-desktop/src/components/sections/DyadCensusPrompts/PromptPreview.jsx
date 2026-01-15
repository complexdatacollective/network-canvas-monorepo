import { Markdown } from "@codaco/ui/lib/components/Fields";
import PropTypes from "prop-types";

const PromptPreview = ({ text }) => <Markdown label={text} />;

PromptPreview.propTypes = {
	text: PropTypes.string.isRequired,
};

export default PromptPreview;
