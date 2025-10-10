import { betterAuth } from "better-auth";

export const auth = betterAuth({
	database: {
		provider: "postgresql",
		url: process.env.DATABASE_URL || "",
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
		minPasswordLength: 8,
		maxPasswordLength: 128,
	},
	session: {
		expiresIn: 60 * 15,
		updateAge: 60 * 5,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
	},
	advanced: {
		cookiePrefix: "fresco",
		useSecureCookies: process.env.NODE_ENV === "production",
		crossSubDomainCookies: {
			enabled: false,
		},
	},
	trustedOrigins: [
		process.env.CORS_ORIGIN || "http://localhost:3001",
		process.env.PLATFORM_URL || "http://localhost:3001",
	],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
