import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {},

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_ALGOLIA_APPLICATION_ID: z.string().min(1),
    NEXT_PUBLIC_ALGOLIA_INDEX_NAME: z.string().min(1),
    NEXT_PUBLIC_ALGOLIA_API_KEY: z.string().min(1),
    NEXT_PUBLIC_GA_ID: z.string().min(1),
    // Name of the facetable Algolia attribute holding each record's workflow
    // section slug, used to boost results from the reader's current section.
    // Leave unset until the index has that attribute in `attributesForFaceting`
    // — when unset, the boost is disabled so search keeps working.
    NEXT_PUBLIC_ALGOLIA_SECTION_FACET: z.string().min(1).optional(),
  },
  shared: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */

  runtimeEnv: {
    NEXT_PUBLIC_ALGOLIA_APPLICATION_ID:
      process.env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID,
    NEXT_PUBLIC_ALGOLIA_INDEX_NAME: process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME,
    NEXT_PUBLIC_ALGOLIA_API_KEY: process.env.NEXT_PUBLIC_ALGOLIA_API_KEY,
    NEXT_PUBLIC_ALGOLIA_SECTION_FACET:
      process.env.NEXT_PUBLIC_ALGOLIA_SECTION_FACET,
    NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: true,
});
