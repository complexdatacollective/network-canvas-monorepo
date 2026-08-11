import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Session state and sign-in actions against the server's /api/auth surface
// (better-auth behind the server's src/auth seam, #1245). No baseURL: the SPA
// is same-origin with the server in every topology — the #1245 invariant —
// so requests resolve against the page origin.

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
