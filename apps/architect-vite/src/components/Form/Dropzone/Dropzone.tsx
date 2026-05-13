import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import Spinner from "~/components/Spinner";
import { Icon } from "~/lib/legacy-ui/components";
import { cva, cx } from "~/utils/cva";
import { acceptsFiles, getRejectedExtensions } from "./helpers";
import useTimer from "./useTimer";

type DropzoneState = {
	isActive: boolean;
	isAcceptable: boolean;
	isDisabled: boolean;
	isLoading: boolean;
	isError: boolean;
	isHover: boolean;
	error: string | null;
};

const initialState: DropzoneState = {
	isActive: false, // is doing something
	isAcceptable: false, // can accept file
	isDisabled: false, // is disabled
	isLoading: false, // file is being imported
	isError: false,
	isHover: false,
	error: null,
};

type DropzoneProps = {
	onDrop: (files: File[]) => Promise<unknown>;
	className?: string;
	accepts?: string[];
	disabled?: boolean;
};

type DropzoneStateName = "idle" | "active" | "hover" | "loading" | "error" | "disabled";

const dropzoneVariants = cva({
	base: "relative isolate flex h-(--space-6xl) cursor-pointer items-center justify-center overflow-hidden rounded-(--space-lg) border-2 border-transparent bg-surface-accent p-(--space-2xl) text-base leading-normal transition-[border-color] duration-(--animation-duration-slow) ease-(--animation-easing)",
	variants: {
		state: {
			idle: "",
			active: "cursor-default",
			hover: "border-info duration-(--animation-duration-fast)",
			loading: "cursor-wait",
			error: "border-warning duration-(--animation-duration-fast)",
			disabled: "",
		},
	},
	defaultVariants: {
		state: "idle",
	},
});

const labelVariants = cva({
	base: "relative z-[2] text-white transition-opacity duration-(--animation-duration-standard) ease-(--animation-easing)",
	variants: {
		state: {
			idle: "opacity-100",
			active: "opacity-50",
			hover: "opacity-100",
			loading: "opacity-0",
			error: "opacity-100",
			disabled: "opacity-100",
		},
	},
	defaultVariants: {
		state: "idle",
	},
});

const loadingVariants = cva({
	base: "absolute inset-0 flex items-center justify-center transition-opacity duration-(--animation-duration-standard) ease-(--animation-easing)",
	variants: {
		state: {
			idle: "opacity-0",
			active: "opacity-0",
			hover: "opacity-0",
			loading: "opacity-100",
			error: "opacity-0",
			disabled: "opacity-0",
		},
	},
	defaultVariants: {
		state: "idle",
	},
});

const Dropzone = ({ onDrop, className, accepts = [], disabled = false }: DropzoneProps) => {
	const [state, setState] = useState(initialState);

	const isDisabled = disabled || state.isActive;

	useTimer(
		() => {
			setState((previousState) => ({
				...previousState,
				isHover: false,
				isError: false,
			}));
		},
		1000,
		[state.isHover, state.isError],
	);

	const resetState = useCallback(() => {
		setState((previousState) => ({ ...previousState, ...initialState }));
	}, []);

	const handleDrop = useCallback(
		(acceptedFiles: File[], fileRejections: { file: File }[]) => {
			if (isDisabled) {
				return;
			}

			setState((previousState) => ({ ...previousState, isActive: true }));

			// Handle file rejections from react-dropzone
			if (fileRejections.length > 0) {
				const extensions = fileRejections.map((rejection: { file: File }) => {
					const match = /(\.[A-Za-z0-9]+)$/.exec(rejection.file.name);
					return match ? match[1] : rejection.file.name;
				});
				const errorMessage = `This asset type does not support ${extensions.join(", ")} extension(s). Supported types are: ${accepts.join(", ")}.`;
				setState((previousState) => ({
					...previousState,
					isActive: false,
					isError: true,
					error: errorMessage,
				}));
				return;
			}

			// Additional validation for accepted files
			const isAcceptable = acceptsFiles(accepts, acceptedFiles);

			if (!isAcceptable) {
				const extensions = getRejectedExtensions(accepts, acceptedFiles);
				const errorMessage = `This asset type does not support ${extensions.join(", ")} extension(s). Supported types are: ${accepts.join(", ")}.`;
				setState((previousState) => ({
					...previousState,
					isActive: false,
					isError: true,
					error: errorMessage,
				}));
				return;
			}

			setState((previousState) => ({
				...previousState,
				isAcceptable: true,
				isError: false,
				error: null,
				isLoading: true,
			}));

			onDrop(acceptedFiles).finally(resetState);
		},
		[accepts, onDrop, resetState, isDisabled],
	);

	// Convert accepts array to react-dropzone format
	const acceptObject = accepts.reduce(
		(acc, ext) => {
			// Group extensions by MIME type category
			// For now, use a generic MIME type that accepts any file with the extension
			acc["application/octet-stream"] = acc["application/octet-stream"] || [];
			acc["application/octet-stream"].push(ext);
			return acc;
		},
		{} as Record<string, string[]>,
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop: handleDrop,
		accept: Object.keys(acceptObject).length > 0 ? acceptObject : undefined,
		disabled: isDisabled,
		multiple: false,
		noClick: false,
		noKeyboard: false,
	});

	const dropzoneState: DropzoneStateName = state.isError
		? "error"
		: state.isLoading
			? "loading"
			: isDragActive
				? "hover"
				: isDisabled
					? "disabled"
					: state.isActive
						? "active"
						: "idle";

	return (
		<div>
			<div {...getRootProps()} className={dropzoneVariants({ state: dropzoneState, class: className })}>
				<input {...getInputProps()} />
				<div
					className={cx(
						"absolute inset-0 z-[1] bg-transparent transition-[background-color] duration-(--animation-duration-fast) ease-(--animation-easing)",
					)}
				/>
				<div className={labelVariants({ state: dropzoneState })}>
					Drag and drop a file here to import it, or&nbsp;
					<span className="inline-block cursor-pointer border-b-2 border-action">
						click here to select a file from your computer
					</span>
					.
				</div>
				<div className={loadingVariants({ state: dropzoneState })}>{state.isActive && <Spinner size="sm" />}</div>
			</div>
			{state.error && (
				<div className="mt-(--space-xs) flex items-center overflow-hidden rounded-(--space-xs) bg-warning px-(--space-lg) py-(--space-xs) opacity-100 transition-opacity duration-(--animation-duration-fast) [&_.icon]:mr-(--space-xs) [&_.icon]:h-[1.2rem] [&_.icon]:w-[1.2rem]">
					<Icon name="warning" />
					{state.error}
				</div>
			)}
		</div>
	);
};

export default Dropzone;
