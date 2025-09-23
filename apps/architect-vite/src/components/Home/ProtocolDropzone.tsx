import { FilePlus, FolderOpen, Upload } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useDispatch } from "react-redux";
import { createNetcanvas, openLocalNetcanvas } from "~/ducks/modules/userActions/userActions";
import Button from "~/lib/legacy-ui/components/Button";

export default function ProtocolDropzone() {
	const dispatch = useDispatch();

	const handleCreateNewProtocol = () => {
		dispatch(createNetcanvas());
	};

	const onDrop = (acceptedFiles: File[]) => {
		if (acceptedFiles.length > 0) {
			dispatch(openLocalNetcanvas(acceptedFiles[0]));
		}
	};

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept: { "": [".netcanvas"] },
		multiple: false,
	});

	return (
		<div
			{...getRootProps()}
			className={`border-2 h-[400px] bg-surface-3 border-dashed rounded-lg p-8 flex flex-col items-center justify-center space-y-4 mb-8 w-full cursor-pointer transition
        ${isDragActive ? "border-accent bg-white" : "hover:border-accent hover:bg-white"}`}
		>
			<input {...getInputProps()} />
			<div className="w-12 h-12 bg-primary p-2 rounded-full flex items-center justify-center">
				<Upload className="text-primary-foreground" />
			</div>
			<h3>Upload a Network Canvas protocol to get started</h3>
			<p className="text-sm">Drag and drop your .netcanvas file here, or click to browse</p>

			<div className="flex md:flex-row flex-col gap-2">
				<Button
					color="sea-green"
					onClick={(e) => {
						e.stopPropagation(); // prevent triggering dropzone
						handleCreateNewProtocol();
					}}
				>
					<FilePlus />
					Create new
				</Button>
				<Button
					color="slate-blue"
					onClick={(e) => {
						e.stopPropagation(); // prevent triggering dropzone
						document.querySelector<HTMLInputElement>("input[type=file]")?.click();
					}}
				>
					<FolderOpen />
					Open existing
				</Button>
			</div>
		</div>
	);
}
