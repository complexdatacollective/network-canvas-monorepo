const MAX_SVG_FILE_SIZE_BYTES = 5 * 1024 * 1024; // ~5 MB

export class SvgFileTooLargeError extends Error {
  readonly reason = 'too-large';
  readonly fileSize: number;
  readonly maxSize: number;

  constructor(fileSize: number, maxSize: number = MAX_SVG_FILE_SIZE_BYTES) {
    super(
      `The file is ${fileSize} bytes, exceeding the ${maxSize} byte limit for a background SVG.`,
    );
    this.name = 'SvgFileTooLargeError';
    this.fileSize = fileSize;
    this.maxSize = maxSize;
  }
}

// Reads a File as text for parsing with svg/parse.ts's parseDocument, guarded
// against implausibly large uploads (a hand-authored background SVG should be
// well under a megabyte) before the bytes are pulled into memory.
export async function readSvgFile(file: File): Promise<string> {
  if (file.size > MAX_SVG_FILE_SIZE_BYTES) {
    throw new SvgFileTooLargeError(file.size);
  }
  return file.text();
}

// Drag-and-drop sources often omit the MIME type (or report an empty
// string), so accept either a matching MIME type or a `.svg` extension.
export function isSvgFile(file: File): boolean {
  return (
    file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  );
}
