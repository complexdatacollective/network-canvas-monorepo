import File from "./File";
import { Video } from "../../Assets";

type VideoInputProps = {
	input?: {
		value?: string;
		onChange?: (value: string) => void;
	};
	meta?: {
		error?: string;
		touched?: boolean;
		invalid?: boolean;
	};
	[key: string]: unknown;
};

const VideoInput = (props: VideoInputProps) => (
	<File
		type="video"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		{(id: string) => (
			<div className="form-fields-video">
				<Video className="form-fields-video__still" id={id} controls />
			</div>
		)}
	</File>
);

export default VideoInput;
