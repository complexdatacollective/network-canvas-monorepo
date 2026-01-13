import PropTypes from "prop-types";
import React from "react";

const PresetPreview = ({ label }) => <div>{label}</div>;

PresetPreview.propTypes = {
	label: PropTypes.string.isRequired,
};

export default PresetPreview;
