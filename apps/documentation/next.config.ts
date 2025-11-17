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
	typedRoutes: true,
	/** Enables hot reloading for local packages without a build step */
	transpilePackages: ["@codaco/ui"],
	experimental: {
		fallbackNodePolyfills: false, // Turning this off will cause issues with Nodejs dependencies (such as dotenv) if they get imported into client code.
	},
	/** We already do linting and typechecking as separate tasks in CI */
	typescript: { ignoreBuildErrors: true },
};

// Merge NextIntl config with Next.js config
export default withBundleAnalyzer(withNextIntl(nextConfig));
