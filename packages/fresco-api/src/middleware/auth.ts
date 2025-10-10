import type { Context, Next } from "hono";
import { auth } from "../lib/auth.js";

export interface AuthVariables {
	user?: {
		id: string;
		email: string;
	};
	session?: {
		id: string;
		userId: string;
		expiresAt: Date;
	};
}

export const authMiddleware = async (c: Context, next: Next) => {
	try {
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (session) {
			c.set("user", {
				id: session.user.id,
				email: session.user.email,
			});
			c.set("session", {
				id: session.session.id,
				userId: session.session.userId,
				expiresAt: session.session.expiresAt,
			});
		}
	} catch {
		// Silent fail - user will be undefined if session cannot be retrieved
	}

	return next();
};
