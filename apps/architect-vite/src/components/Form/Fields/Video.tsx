import { Video } from "../../Assets";
import File from "./File";

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

const VideoInput = (props: VideoInputProps) => {
	const { input, meta, ...rest } = props;

	const inputProps = {
		value: input?.value ?? "",
		onChange: input?.onChange ?? (() => {}),
	};

	const metaProps = {
		error: meta?.error,
		touched: meta?.touched,
		invalid: meta?.invalid,
	};

	return (
		<File
			type="video"
			input={inputProps}
			meta={metaProps}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...rest}
		>
			{(id: string) => (
				<div className="form-fields-video">
					<Video className="form-fields-video__still" id={id} controls />
				</div>
			)}
		</File>
	);
};

export default VideoInput;
