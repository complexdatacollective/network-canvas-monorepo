import { FileUp } from 'lucide-react';
import { type ReactElement, type ReactNode, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

import { openDroppedFileFlow } from './fileActions';

// Wraps the canvas region so a background SVG can be opened by dropping it
// anywhere over the editor. The drop handlers live on the region itself (not a
// covering layer), so ordinary canvas pointer interaction is untouched; the only
// overlay is the visual drop hint, which appears while a drag is in progress.
export function FileDropzone({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const dialogs = useDialog();

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (file) void openDroppedFileFlow(dialogs, file);
    },
    [dialogs],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/svg+xml': ['.svg'] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div {...getRootProps()} className="relative size-full">
      <input {...getInputProps()} />
      {children}
      {isDragActive && (
        <div className="bg-background/70 text-text pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
          <FileUp aria-hidden className="size-10" />
          <p className="text-lg font-semibold">Drop an SVG to open it</p>
        </div>
      )}
    </div>
  );
}
