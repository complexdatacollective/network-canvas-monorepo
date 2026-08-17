import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// No baseURL: the SPA is same-origin with the server in every topology (the
// #1245 invariant), so requests resolve against the page origin.

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
