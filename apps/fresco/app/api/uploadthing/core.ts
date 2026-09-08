import { createUploadthing } from 'uploadthing/next';

import { getServerSession } from '~/lib/auth/guards';
import { requiresTwoFactorSetup } from '~/lib/auth/twoFactorPolicy';

const f = createUploadthing();

export const ourFileRouter = {
  // `blob` intentionally accepts any media type: Network Canvas protocol assets
  // span images/audio/video and rejecting types would break valid protocols.
  // UploadThing serves uploads from its own (cross-origin) domain, so an
  // uploaded SVG/HTML cannot execute in the Fresco origin. The same-origin S3
  // serving path is hardened separately in app/api/assets/[key]/route.ts
  // (validated content-type, nosniff, and attachment disposition for
  // script-capable types).
  assetRouter: f({
    blob: { maxFileSize: '256MB', maxFileCount: 50 },
  })
    .middleware(async () => {
      const session = await getServerSession();
      if (!session) {
        throw new Error('You must be logged in to upload assets.');
      }
      // The same gate the Server Actions apply: an account that still has to
      // set up mandatory two-factor authentication can reach nothing else.
      if (await requiresTwoFactorSetup(session.user.userId)) {
        throw new Error('Two-factor authentication setup required.');
      }
      return {};
    })
    .onUploadComplete(() => undefined),
};

export type OurFileRouter = typeof ourFileRouter;
