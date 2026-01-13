import { Markdown } from "@codaco/ui/lib/components/Fields";
import PropTypes from "prop-types";
import React from "react";

const PromptPreview = ({ text }) => <Markdown label={text} />;

PromptPreview.propTypes = {
	text: PropTypes.string.isRequired,
};

export default PromptPreview;
