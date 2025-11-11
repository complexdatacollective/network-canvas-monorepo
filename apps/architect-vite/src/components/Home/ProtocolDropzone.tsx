import { FilePlus, FolderOpen, Upload } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useAppDispatch } from "~/ducks/hooks";
import { createNetcanvas, openLocalNetcanvas } from "~/ducks/modules/userActions/userActions";
import Button from "~/lib/legacy-ui/components/Button";
import { cn } from "~/utils/cn";

type ProtocolDropzoneProps = {
	onLoadProtocol: (action: () => Promise<unknown>) => Promise<void>;
};

export default function ProtocolDropzone({ onLoadProtocol }: ProtocolDropzoneProps) {
	const dispatch = useAppDispatch();

	const handleCreateNewProtocol = () => {
		onLoadProtocol(async () => await dispatch(createNetcanvas()));
	};

	const onDrop = (acceptedFiles: File[]) => {
		if (acceptedFiles.length > 0) {
			onLoadProtocol(async () => await dispatch(openLocalNetcanvas(acceptedFiles[0])));
		}
	};

	const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
		onDrop,
		accept: { "application/octet-stream": [".netcanvas"] },
		multiple: false,
	});

	return (
		<div
			{...getRootProps()}
			className={cn(
				"border-2 h-full min-h-[400px] bg-surface-3 border-dashed rounded-lg p-8 flex flex-col flex-1 items-center justify-center space-y-4 mb-8 w-full cursor-pointer transition",
				isDragActive ? "border-accent bg-accent/10" : "hover:border-accent hover:bg-accent/10",
			)}
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
						e.stopPropagation();
						open();
					}}
				>
					<FolderOpen />
					Open existing
				</Button>
			</div>
		</div>
	);
}
