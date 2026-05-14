import { BackgroundImage } from "../../Assets";
import type { FileInputProps } from "./File";
import File from "./File";

type ImageInputProps = Omit<FileInputProps, "children" | "type">;

const ImageInput = (props: ImageInputProps) => (
	<File
		type="image"
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		{(id: string) => (
			<div className="w-full rounded-(--radius) bg-rich-black p-(--space-md)">
				<BackgroundImage id={id} className="h-[30vh] w-full bg-contain bg-center bg-no-repeat" />
			</div>
		)}
	</File>
);

export default ImageInput;
