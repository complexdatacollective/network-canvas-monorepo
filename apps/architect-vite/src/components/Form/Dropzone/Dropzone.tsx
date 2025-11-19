import cx from "classnames";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Icon, Spinner } from "~/lib/legacy-ui/components";
import { acceptsFiles, getAcceptsExtensions, getRejectedExtensions } from "./helpers";
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

const Dropzone = ({ onDrop, className = "form-dropzone", accepts = [], disabled = false }: DropzoneProps) => {
	const [state, setState] = useState(initialState);

	const isDisabled = disabled || state.isActive;

	useTimer(
		() => {
			setState((previousState) => ({ ...previousState, isHover: false, isError: false }));
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

	const dropzoneClasses = cx(className, {
		[`${className}--active`]: state.isActive,
		[`${className}--hover`]: isDragActive,
		[`${className}--loading`]: state.isLoading,
		[`${className}--error`]: state.isError,
		[`${className}--disabled`]: isDisabled,
	});

	const errorClasses = cx(`${className}__error`, {
		[`${className}__error--show`]: state.error,
	});

	return (
		<div>
			<div {...getRootProps()} className={dropzoneClasses}>
				<input {...getInputProps()} />
				<div className={`${className}__container`} />
				<div className={`${className}__label`}>
					Drag and drop a file here to import it, or&nbsp;
					<span className={`${className}__link`}>click here to select a file from your computer</span>.
				</div>
				<div className={`${className}__loading`}>{state.isActive && <Spinner small />}</div>
			</div>
			{state.error && (
				<div className={errorClasses}>
					<Icon name="warning" />
					{state.error}
				</div>
			)}
		</div>
	);
};

export { Dropzone };

export default Dropzone;
