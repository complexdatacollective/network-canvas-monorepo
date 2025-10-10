/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	transpilePackages: ["@codaco/ui"],
	env: {
		DATABASE_URL: process.env.DATABASE_URL,
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
	},
};

export default nextConfig;
