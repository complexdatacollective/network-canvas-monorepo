import type { Filetype } from '@codaco/fresco-ui/utils/saveBlob';

export const SVG_FILETYPE: Filetype = {
  description: 'SVG image',
  mimeType: 'image/svg+xml',
  extension: '.svg',
};

export const PYTHON_FILETYPE: Filetype = {
  description: 'Python script',
  mimeType: 'text/x-python',
  extension: '.py',
};

export const R_FILETYPE: Filetype = {
  description: 'R script',
  mimeType: 'text/plain',
  extension: '.R',
};
