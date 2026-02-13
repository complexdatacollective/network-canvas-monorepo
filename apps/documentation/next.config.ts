import NextBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";
import createNextIntl from "next-intl/plugin";

const withNextIntl = createNextIntl("./lib/i18n/request.ts");
const withBundleAnalyzer = NextBundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

const isProduction =
	process.env.VERCEL_ENV === "production" ||
	process.env.CONTEXT === "production" ||
	process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	output: "export",
	images: {
		unoptimized: true,
	},
	env: {
		NEXT_PUBLIC_IS_PRODUCTION: String(isProduction),
	},
	typedRoutes: true,
	/** Enables hot reloading for local packages without a build step */
	transpilePackages: ["@codaco/ui"],
	/** We already do linting and typechecking as separate tasks in CI */
	typescript: { ignoreBuildErrors: true },
};

// Merge NextIntl config with Next.js config
export default withBundleAnalyzer(withNextIntl(nextConfig));
