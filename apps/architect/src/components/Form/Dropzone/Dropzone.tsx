/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { TriangleAlert } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import Spinner from '@codaco/fresco-ui/Spinner';
import { cva, cx } from '~/utils/cva';

import { acceptsFiles, getRejectedExtensions } from './helpers';
import useTimer from './useTimer';

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

type DropzoneStateName =
  | 'idle'
  | 'active'
  | 'hover'
  | 'loading'
  | 'error'
  | 'disabled';

const dropzoneVariants = cva({
  base: 'focusable bg-input text-input-contrast border-input-contrast/30 relative isolate flex min-h-36 cursor-pointer items-center justify-center overflow-hidden rounded border-2 border-dashed p-6 text-base leading-normal transition-[border-color,background-color,opacity] duration-300 ease-in-out',
  variants: {
    state: {
      idle: '',
      active: 'cursor-default',
      hover: 'border-primary bg-primary/10 duration-150',
      loading: 'cursor-wait',
      error: 'border-destructive duration-150',
      disabled: 'cursor-not-allowed opacity-50',
    },
  },
  defaultVariants: {
    state: 'idle',
  },
});

const labelVariants = cva({
  base: 'relative z-2 text-current transition-opacity duration-300 ease-in-out',
  variants: {
    state: {
      idle: 'opacity-100',
      active: 'opacity-50',
      hover: 'opacity-100',
      loading: 'opacity-0',
      error: 'opacity-100',
      disabled: 'opacity-100',
    },
  },
  defaultVariants: {
    state: 'idle',
  },
});

const loadingVariants = cva({
  base: 'absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-in-out',
  variants: {
    state: {
      idle: 'opacity-0',
      active: 'opacity-0',
      hover: 'opacity-0',
      loading: 'opacity-100',
      error: 'opacity-0',
      disabled: 'opacity-0',
    },
  },
  defaultVariants: {
    state: 'idle',
  },
});

const Dropzone = ({
  onDrop,
  className,
  accepts = [],
  disabled = false,
}: DropzoneProps) => {
  const [state, setState] = useState(initialState);
  const errorId = useId();

  const isDisabled = disabled || state.isActive;

  useTimer(
    () => {
      setState((previousState) => ({
        ...previousState,
        isHover: false,
        isError: false,
        error: previousState.isError ? null : previousState.error,
      }));
    },
    5000,
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
        const errorMessage = `This asset type does not support ${extensions.join(', ')} extension(s). Supported types are: ${accepts.join(', ')}.`;
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
        const errorMessage = `This asset type does not support ${extensions.join(', ')} extension(s). Supported types are: ${accepts.join(', ')}.`;
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

      void Promise.resolve()
        .then(() => onDrop(acceptedFiles))
        .then(resetState)
        .catch((error: unknown) => {
          setState((previousState) => ({
            ...previousState,
            isActive: false,
            isLoading: false,
            isError: true,
            error:
              error instanceof Error && error.message
                ? error.message
                : 'Unable to import this file.',
          }));
        });
    },
    [accepts, onDrop, resetState, isDisabled],
  );

  // Convert accepts array to react-dropzone format
  const acceptObject = accepts.reduce(
    (acc, ext) => {
      // Group extensions by MIME type category
      // For now, use a generic MIME type that accepts any file with the extension
      acc['application/octet-stream'] = acc['application/octet-stream'] || [];
      acc['application/octet-stream'].push(ext);
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
    ? 'error'
    : state.isLoading
      ? 'loading'
      : isDragActive
        ? 'hover'
        : isDisabled
          ? 'disabled'
          : state.isActive
            ? 'active'
            : 'idle';

  return (
    <div>
      <div
        {...getRootProps()}
        role="button"
        aria-label="Upload file"
        aria-busy={state.isLoading || undefined}
        aria-disabled={isDisabled || undefined}
        aria-describedby={state.error ? errorId : undefined}
        className={dropzoneVariants({ state: dropzoneState, class: className })}
      >
        <input {...getInputProps()} />
        <div
          className={cx(
            'absolute inset-0 z-1 bg-transparent transition-[background-color] duration-150 ease-in-out',
          )}
        />
        <div className={labelVariants({ state: dropzoneState })}>
          Drag and drop a file here to import it, or&nbsp;
          <span className="border-primary inline-block cursor-pointer border-b-2">
            click here to select a file from your computer
          </span>
          .
        </div>
        <div className={loadingVariants({ state: dropzoneState })}>
          {state.isActive && <Spinner size="sm" />}
        </div>
        <span className="sr-only" aria-live="polite">
          {state.isLoading ? 'Importing file…' : ''}
        </span>
      </div>
      {state.error && (
        <div
          id={errorId}
          role="alert"
          className="bg-destructive text-destructive-contrast mt-2 flex items-center gap-2 overflow-hidden rounded px-4 py-2 opacity-100 transition-opacity duration-150"
        >
          <TriangleAlert aria-hidden />
          {state.error}
        </div>
      )}
    </div>
  );
};

export default Dropzone;
