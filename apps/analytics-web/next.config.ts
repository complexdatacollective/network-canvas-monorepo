import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,

	/** Enables hot reloading for local packages without a build step */
	transpilePackages: ["@codaco/ui"],

	/** We already do linting and typechecking as separate tasks in CI */
	typescript: { ignoreBuildErrors: true },
};

export default config;
