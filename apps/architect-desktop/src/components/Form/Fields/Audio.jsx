import React from "react";
import { Audio } from "../../Assets";
import File from "./File";

const AudioInput = (props) => (
	<File
		type="audio"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		{(id) => (
			<div className="form-fields-audio">
				<Audio id={id} controls />
			</div>
		)}
	</File>
);

export default AudioInput;
