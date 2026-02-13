const API_HOST = "us.i.posthog.com";
const ASSET_HOST = "us-assets.i.posthog.com";
const DUMMY_API_KEY = "phc_proxy_mode_placeholder";

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	const url = new URL(request.url);

	let response: Response;
	if (url.pathname.startsWith("/static/")) {
		response = await retrieveStatic(request, url.pathname + url.search, ctx);
	} else {
		response = await forwardRequest(request, env, url);
	}

	return addCorsHeaders(response);
}

function addCorsHeaders(response: Response): Response {
	const newResponse = new Response(response.body, response);
	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		newResponse.headers.set(key, value);
	}
	return newResponse;
}

async function retrieveStatic(request: Request, pathname: string, ctx: ExecutionContext): Promise<Response> {
	let response = await caches.default.match(request);
	if (!response) {
		response = await fetch(`https://${ASSET_HOST}${pathname}`);
		ctx.waitUntil(caches.default.put(request, response.clone()));
	}
	return response;
}

async function forwardRequest(request: Request, env: Env, url: URL): Promise<Response> {
	const ip = request.headers.get("CF-Connecting-IP") || "";
	const originHeaders = new Headers(request.headers);
	originHeaders.delete("cookie");
	originHeaders.set("X-Forwarded-For", ip);

	// Replace dummy API key in URL path (e.g. /array/phc_proxy_mode_placeholder/config)
	const pathname = url.pathname.replaceAll(DUMMY_API_KEY, env.POSTHOG_API_KEY);

	const targetUrl = new URL(`https://${API_HOST}${pathname}`);
	for (const [key, value] of url.searchParams) {
		if ((key === "token" || key === "api_key") && value === DUMMY_API_KEY) {
			targetUrl.searchParams.set(key, env.POSTHOG_API_KEY);
		} else {
			targetUrl.searchParams.set(key, value);
		}
	}

	let body: BodyInit | null = null;

	if (request.method === "POST" && request.body) {
		const compression = url.searchParams.get("compression");

		if (compression === "gzip-js" || compression === "gzip") {
			try {
				const decompressed = request.body.pipeThrough(new DecompressionStream("gzip"));
				const text = await new Response(decompressed).text();
				body = injectApiKey(text, env.POSTHOG_API_KEY);
				targetUrl.searchParams.delete("compression");
				originHeaders.set("Content-Type", "application/json");
				originHeaders.delete("Content-Encoding");
			} catch {
				body = request.body;
			}
		} else if (compression === "base64") {
			try {
				// PostHog JS sends base64 as form-encoded: data=<url-encoded-base64>
				const formText = await request.text();
				const params = new URLSearchParams(formText);
				const encoded = params.get("data") ?? formText;
				const decoded = atob(encoded);
				body = injectApiKey(decoded, env.POSTHOG_API_KEY);
				targetUrl.searchParams.delete("compression");
				originHeaders.set("Content-Type", "application/json");
			} catch {
				body = request.body;
			}
		} else {
			try {
				const text = await request.text();
				body = injectApiKey(text, env.POSTHOG_API_KEY);
			} catch {
				body = request.body;
			}
		}
	}

	return await fetch(
		new Request(targetUrl.toString(), {
			method: request.method,
			headers: originHeaders,
			body,
			redirect: request.redirect,
		}),
	);
}

/**
 * PostHog JS sends the API key (token) in multiple locations depending on
 * the endpoint and payload format:
 * - Top-level `token` or `api_key` field (single event objects)
 * - `properties.token` (nested in event properties)
 * - Array of events, each with their own `token`/`properties.token`
 * - `batch` array within a wrapper object
 */
function injectApiKey(text: string, apiKey: string): string {
	try {
		const data = JSON.parse(text);
		if (Array.isArray(data)) {
			for (const item of data) {
				replaceKeysInEvent(item, apiKey);
			}
			return JSON.stringify(data);
		}
		if (typeof data === "object" && data !== null) {
			replaceKeysInEvent(data, apiKey);
			if (Array.isArray(data.batch)) {
				for (const item of data.batch) {
					replaceKeysInEvent(item, apiKey);
				}
			}
			return JSON.stringify(data);
		}
	} catch {
		// Not valid JSON — return unmodified
	}
	return text;
}

function replaceKeysInEvent(obj: Record<string, unknown>, apiKey: string): void {
	if (typeof obj !== "object" || obj === null) return;
	if ("api_key" in obj) obj.api_key = apiKey;
	if ("token" in obj) obj.token = apiKey;
	if (typeof obj.properties === "object" && obj.properties !== null) {
		const props = obj.properties as Record<string, unknown>;
		if ("token" in props) props.token = apiKey;
		if ("api_key" in props) props.api_key = apiKey;
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return handleRequest(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
