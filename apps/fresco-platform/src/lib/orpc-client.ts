import type { ApiRouter } from "@fresco/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { authClient } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const link = new RPCLink({
	url: `${API_URL}/api`,
	headers: async () => {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		try {
			const sessionData = await authClient.getSession();
			if (sessionData?.data?.session) {
				headers.Cookie = document.cookie;
			}
		} catch {
			// No session available or auth not configured yet - continue without auth headers
		}

		return headers;
	},
	credentials: "include",
});

export const orpcClient = createORPCClient<ApiRouter>(link);
