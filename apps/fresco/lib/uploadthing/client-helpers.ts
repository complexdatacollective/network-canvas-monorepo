import { genUploader } from 'uploadthing/client';

import type { OurFileRouter } from '~/app/api/public/uploadthing/core';

export const { createUpload } = genUploader<OurFileRouter>({
  // The SDK defaults to `/api/uploadthing`. Fresco serves the route under the
  // public API prefix so a reverse proxy can restrict every other `/api/` path
  // to the researchers' network — see SECURITY.md.
  url: '/api/public/uploadthing',
});
