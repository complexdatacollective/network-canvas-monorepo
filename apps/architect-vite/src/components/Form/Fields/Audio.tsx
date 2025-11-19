import { Audio } from "../../Assets";
import File from "./File";
import type { FileInputProps } from "./File";

type AudioInputProps = Omit<FileInputProps, "children" | "type">;

const AudioInput = (props: AudioInputProps) => (
	<File
		type="audio"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		{(id: string) => (
			<div className="form-fields-audio">
				<Audio id={id} controls />
			</div>
		)}
	</File>
);

export default AudioInput;
