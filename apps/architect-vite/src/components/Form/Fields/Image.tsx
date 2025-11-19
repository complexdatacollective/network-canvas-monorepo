import { BackgroundImage } from "../../Assets";
import File from "./File";
import type { FileInputProps } from "./File";

type ImageInputProps = Omit<FileInputProps, "children" | "type">;

const ImageInput = (props: ImageInputProps) => (
	<File
		type="image"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		{(id: string) => (
			<div className="form-fields-image">
				<BackgroundImage id={id} className="form-fields-image__image" />
			</div>
		)}
	</File>
);

export default ImageInput;
