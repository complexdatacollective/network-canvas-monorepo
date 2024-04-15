				import worker, * as OTHER_EXPORTS from "D:\\Projects\\Network Canvas\\network-canvas-monorepo\\apps\\hono-server\\src\\index.ts";
				import * as __MIDDLEWARE_0__ from "D:\\Projects\\Network Canvas\\network-canvas-monorepo\\node_modules\\.pnpm\\wrangler@3.50.0_@cloudflare+workers-types@4.20240405.0\\node_modules\\wrangler\\templates\\middleware\\middleware-ensure-req-body-drained.ts";
import * as __MIDDLEWARE_1__ from "D:\\Projects\\Network Canvas\\network-canvas-monorepo\\node_modules\\.pnpm\\wrangler@3.50.0_@cloudflare+workers-types@4.20240405.0\\node_modules\\wrangler\\templates\\middleware\\middleware-miniflare3-json-error.ts";
				
				worker.middleware = [
					__MIDDLEWARE_0__.default,__MIDDLEWARE_1__.default,
					...(worker.middleware ?? []),
				].filter(Boolean);
				
				export * from "D:\\Projects\\Network Canvas\\network-canvas-monorepo\\apps\\hono-server\\src\\index.ts";
				export default worker;