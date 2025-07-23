import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,

	/** Enables hot reloading for local packages without a build step */
	transpilePackages: ["@codaco/ui"],

	/** CORS configuration for dev server security */
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{
						key: "Access-Control-Allow-Origin",
						value: process.env.NODE_ENV === "development" ? "*" : "same-origin",
					},
					{
						key: "Access-Control-Allow-Methods",
						value: "GET, POST, PUT, DELETE, OPTIONS",
					},
					{
						key: "Access-Control-Allow-Headers",
						value: "Content-Type, Authorization, X-Requested-With",
					},
				],
			},
		];
	},

	/** We already do linting and typechecking as separate tasks in CI */
	eslint: { ignoreDuringBuilds: true },
	typescript: { ignoreBuildErrors: true },
};

export default config;
