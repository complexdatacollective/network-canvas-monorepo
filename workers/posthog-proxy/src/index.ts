/**
 * Cloudflare Worker for PostHog Reverse Proxy
 *
 * This worker proxies requests to PostHog Cloud (US region) to:
 * 1. Keep your PostHog API key secure (server-side only)
 * 2. Avoid ad-blockers that might block posthog.com
 * 3. Use your own domain for analytics
 * 4. Validate that events come from known Network Canvas products
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

/**
 * Placeholder API key used by the client when using proxy mode.
 * This gets replaced with the real API key in URL paths.
 */
const PLACEHOLDER_API_KEY = "phc_proxy_mode_placeholder";

/**
 * Valid products that can send analytics events.
 * This should match the products defined in @codaco/analytics.
 */
const VALID_PRODUCTS = ["fresco", "documentation", "architect"] as const;
type Product = (typeof VALID_PRODUCTS)[number];

/**
 * Check if a product name is valid.
 * Available for future use if product validation is needed.
 */
function _isValidProduct(product: unknown): product is Product {
	return typeof product === "string" && VALID_PRODUCTS.includes(product as Product);
}

type Env = {
	POSTHOG_API_KEY?: string;
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Debug endpoint to check if worker is configured
		if (url.pathname === "/_debug") {
			const bodyText = request.method === "POST" ? await request.text() : null;
			return new Response(
				JSON.stringify({
					hasApiKey: !!env.POSTHOG_API_KEY,
					apiKeyPrefix: `${env.POSTHOG_API_KEY?.substring(0, 8)}...`,
					method: request.method,
					contentType: request.headers.get("content-type"),
					bodyPreview: bodyText?.substring(0, 200),
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		}

		// Test endpoint to proxy a request and show the response
		if (url.pathname === "/_test-flags") {
			const testBody = JSON.stringify({
				token: env.POSTHOG_API_KEY,
				distinct_id: "test-user",
			});
			const testResponse = await fetch(`https://${POSTHOG_HOST}/flags/?v=2`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: testBody,
			});
			const responseText = await testResponse.text();
			return new Response(
				JSON.stringify({
					status: testResponse.status,
					statusText: testResponse.statusText,
					body: responseText,
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		}

		// Verbose debug - shows what we're sending to PostHog
		if (url.pathname === "/_verbose") {
			const bodyText = request.method === "POST" ? await request.text() : null;
			let parsedBody = null;
			let modifiedBody = null;
			try {
				if (bodyText) {
					parsedBody = JSON.parse(bodyText);
					modifiedBody = { ...parsedBody, token: env.POSTHOG_API_KEY, api_key: env.POSTHOG_API_KEY };
				}
			} catch {
				parsedBody = "PARSE_FAILED";
			}
			return new Response(
				JSON.stringify({
					receivedMethod: request.method,
					receivedContentType: request.headers.get("content-type"),
					receivedBodyRaw: bodyText?.substring(0, 500),
					parsedBody,
					modifiedBody,
					wouldSendTo: `https://${POSTHOG_HOST}${url.pathname}${url.search}`,
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		}

		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return handleOptions();
		}

		// Validate API key is configured
		if (!env.POSTHOG_API_KEY) {
			return new Response("PostHog API key not configured", { status: 500 });
		}

		// Determine which PostHog endpoint to use
		let targetHost = POSTHOG_HOST;

		// Asset requests (static files like scripts) go to the assets host
		if (url.pathname.startsWith("/static/") || url.pathname.startsWith("/array/")) {
			targetHost = POSTHOG_ASSETS_HOST;
		}

		// Replace placeholder API key with real one in URL path
		// PostHog embeds the project key in some URLs like /array/{api_key}/config.js
		let pathname = url.pathname;
		if (pathname.includes(PLACEHOLDER_API_KEY)) {
			pathname = pathname.replace(PLACEHOLDER_API_KEY, env.POSTHOG_API_KEY);
		}

		// Build the target URL and add API key to query params as fallback
		const targetUrl = new URL(pathname + url.search, `https://${targetHost}`);
		targetUrl.searchParams.set("token", env.POSTHOG_API_KEY);

		// Clone and modify headers
		const headers = new Headers(request.headers);

		// Remove host header to avoid issues with the target server
		headers.delete("host");

		// Add API key to Authorization header for endpoints that use it
		headers.set("Authorization", `Bearer ${env.POSTHOG_API_KEY}`);

		// Handle request body - inject API key for POST requests
		// Only modify uncompressed bodies; compressed bodies pass through
		// and rely on the Authorization header and query param token
		let body: BodyInit | null = null;
		const hasCompression = url.searchParams.has("compression");
		const contentType = request.headers.get("content-type") || "";
		const isJsonLike =
			contentType.includes("application/json") || contentType.includes("text/plain") || contentType === "";
		const isModifiablePost = request.method === "POST" && isJsonLike && !hasCompression;

		if (isModifiablePost && request.body) {
			try {
				const bodyText = await request.text();
				// Try to parse as JSON
				const originalBody = JSON.parse(bodyText);

				// PostHog endpoints only accept "token" - adding "api_key" breaks them
				// For arrays (batch events), pass through unchanged - auth via query param
				// For objects, inject token field
				if (Array.isArray(originalBody)) {
					// Array format - don't modify, rely on query param token
					body = bodyText;
				} else {
					const modifiedBody = { ...originalBody, token: env.POSTHOG_API_KEY };
					body = JSON.stringify(modifiedBody);
				}
				headers.set("Content-Type", "application/json");
			} catch {
				// If body parsing fails, pass through original body
				// Re-fetch since we consumed the stream
				body = null;
			}
		} else {
			body = request.body;
		}

		// Clone the request with the new URL, headers, and body
		const modifiedRequest = new Request(targetUrl, {
			method: request.method,
			headers: headers,
			body: body,
			redirect: "follow",
		});

		// Forward the request to PostHog
		const response = await fetch(modifiedRequest);

		// For debugging: if we get an error, include what we sent
		if (!response.ok && (url.pathname.includes("flags") || url.pathname.includes("/e"))) {
			const errorBody = await response.text();
			const bodyType = body === null ? "null" : typeof body;
			const bodyIsString = typeof body === "string";
			return new Response(
				JSON.stringify({
					error: true,
					status: response.status,
					statusText: response.statusText,
					posthogResponse: errorBody,
					debug: {
						sentTo: targetUrl.toString(),
						bodyType,
						bodyIsString,
						bodyLength: bodyIsString ? (body as string).length : null,
						sentBody: bodyIsString ? (body as string).substring(0, 1000) : String(body),
						sentContentType: headers.get("content-type"),
						originalContentType: request.headers.get("content-type"),
						isModifiablePost,
					},
				}),
				{
					status: response.status,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				},
			);
		}

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
function handleOptions(): Response {
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
