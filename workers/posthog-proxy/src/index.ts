/**
 * Cloudflare Worker for PostHog Reverse Proxy
 *
 * This worker proxies requests to PostHog Cloud (US region) to:
 * 1. Keep your PostHog API key secure (server-side only)
 * 2. Avoid ad-blockers that might block posthog.com
 * 3. Use your own domain for analytics
 *
 * Deploy this worker to: ph-relay.networkcanvas.com
 *
 * Environment Variables Required:
 * - POSTHOG_API_KEY: Your PostHog project API key (set in Cloudflare Worker settings)
 *
 * PostHog US Cloud endpoints:
 * - API/Ingest: us.i.posthog.com
 * - Assets: us-assets.i.posthog.com
 */

const POSTHOG_HOST = "us.i.posthog.com";
const POSTHOG_ASSETS_HOST = "us-assets.i.posthog.com";

interface Env {
	POSTHOG_API_KEY?: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return handleOptions(request);
		}

		// Validate API key is configured
		if (!env.POSTHOG_API_KEY) {
			return new Response("PostHog API key not configured", { status: 500 });
		}

		// Determine which PostHog endpoint to use
		let targetHost = POSTHOG_HOST;

		// Asset requests (static files like scripts)
		if (url.pathname.startsWith("/static/")) {
			targetHost = POSTHOG_ASSETS_HOST;
		}

		// Build the target URL
		const targetUrl = new URL(url.pathname + url.search, `https://${targetHost}`);

		// Clone and modify headers to inject API key
		const headers = new Headers(request.headers);
		headers.set("Authorization", `Bearer ${env.POSTHOG_API_KEY}`);

		// Clone the request with the new URL and headers
		const modifiedRequest = new Request(targetUrl, {
			method: request.method,
			headers: headers,
			body: request.body,
			redirect: "follow",
		});

		// Forward the request to PostHog
		const response = await fetch(modifiedRequest);

		// Clone the response so we can modify headers
		const modifiedResponse = new Response(response.body, response);

		// Add CORS headers to allow requests from any origin
		modifiedResponse.headers.set("Access-Control-Allow-Origin", "*");
		modifiedResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		modifiedResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

		// Remove any existing CSP headers that might block the response
		modifiedResponse.headers.delete("Content-Security-Policy");

		return modifiedResponse;
	},
};

/**
 * Handle CORS preflight OPTIONS requests
 */
function handleOptions(_request: Request): Response {
	const headers = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400", // 24 hours
	};

	return new Response(null, {
		status: 204,
		headers: headers,
	});
}
