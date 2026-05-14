import { UploadCloud } from "lucide-react";
import { type DragEvent, useCallback, useState } from "react";

type FileDropTargetProps = {
	accept?: string;
	onFiles: (files: File[]) => void | Promise<void>;
	label?: string;
	hint?: string;
};

export default function FileDropTarget({ accept = ".netcanvas", onFiles, label, hint }: FileDropTargetProps) {
	const [isOver, setIsOver] = useState(false);

	const onDrop = useCallback(
		async (e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setIsOver(false);
			const files = Array.from(e.dataTransfer?.files ?? []);
			if (files.length > 0) await onFiles(files);
		},
		[onFiles],
	);

	return (
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: drag-and-drop has no native semantic element; the labelled <input type="file"> below is the keyboard-accessible alternative.
		<section
			aria-label="Drop a .netcanvas file to import"
			onDragOver={(e) => {
				e.preventDefault();
				setIsOver(true);
			}}
			onDragLeave={() => setIsOver(false)}
			onDrop={onDrop}
			className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors ${
				isOver ? "border-primary bg-primary/5 text-primary" : "border-border bg-surface-1/40 text-muted-foreground"
			}`}
		>
			<UploadCloud size={32} aria-hidden="true" />
			<div className="font-heading text-base font-semibold text-foreground">
				{label ?? "Drop a .netcanvas file here"}
			</div>
			{hint ? <p className="max-w-sm text-xs">{hint}</p> : null}
			<input
				type="file"
				accept={accept}
				className="sr-only"
				id="modern-interviewer-file-input"
				onChange={async (e) => {
					const files = Array.from(e.target.files ?? []);
					if (files.length > 0) await onFiles(files);
					e.target.value = "";
				}}
			/>
			<label
				htmlFor="modern-interviewer-file-input"
				className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-primary underline-offset-4 hover:underline"
			>
				or choose a file
			</label>
		</section>
	);
}
