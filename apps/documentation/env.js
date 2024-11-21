import { createEnv } from "@t3-oss/env-nextjs";

import { z } from "zod";

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
		NEXT_PUBLIC_DOCS_PATH: z.string().min(1),
		NEXT_PUBLIC_ALGOLIA_APPLICATION_ID: z.string().min(1),
		NEXT_PUBLIC_ALGOLIA_INDEX_NAME: z.string().min(1),
		NEXT_PUBLIC_ALGOLIA_API_KEY: z.string().min(1),
		NEXT_PUBLIC_MENDABLE_ANON_KEY: z.string().min(1),
		NEXT_PUBLIC_GA_ID: z.string().min(1),
	},
	shared: {
		NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */

	runtimeEnv: {
		NEXT_PUBLIC_DOCS_PATH: process.env.NEXT_PUBLIC_DOCS_PATH,
		NEXT_PUBLIC_ALGOLIA_APPLICATION_ID: process.env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID,
		NEXT_PUBLIC_ALGOLIA_INDEX_NAME: process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME,
		NEXT_PUBLIC_ALGOLIA_API_KEY: process.env.NEXT_PUBLIC_ALGOLIA_API_KEY,
		NEXT_PUBLIC_MENDABLE_ANON_KEY: process.env.NEXT_PUBLIC_MENDABLE_ANON_KEY,
		NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
		NODE_ENV: process.env.NODE_ENV,
	},
	skipValidation: true,
});
