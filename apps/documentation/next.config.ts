import NextBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";
import createNextIntl from "next-intl/plugin";

const withNextIntl = createNextIntl("./lib/i18n/request.ts");
const withBundleAnalyzer = NextBundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
	reactStrictMode: true,
	output: "export",
	images: {
		unoptimized: true,
	},
	/** Enables hot reloading for local packages without a build step */
	transpilePackages: ["@codaco/ui"],
	experimental: {
		fallbackNodePolyfills: false, // Turning this off will cause issues with Nodejs dependencies (such as dotenv) if they get imported into client code.
	},
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

// Merge NextIntl config with Next.js config
export default withBundleAnalyzer(withNextIntl(nextConfig));
