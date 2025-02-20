// Protocol type based on discriminated union between all zod schemas
import type { Protocol as Schema1Protocol } from "../schemas/1.zod";
import type { Protocol as Schema2Protocol } from "../schemas/2.zod";
import type { Protocol as Schema3Protocol } from "../schemas/3.zod";
import type { Protocol as Schema4Protocol } from "../schemas/4.zod";
import type { Protocol as Schema5Protocol } from "../schemas/5.zod";
import type { Protocol as Schema6Protocol } from "../schemas/6.zod";
import type { Protocol as Schema7Protocol } from "../schemas/7.zod";
import type { Protocol as Schema8Protocol } from "../schemas/8.zod";

export type Protocol =
	| (Schema1Protocol & { schemaVersion: 1 })
	| (Schema2Protocol & { schemaVersion: 2 })
	| (Schema3Protocol & { schemaVersion: 3 })
	| (Schema4Protocol & { schemaVersion: 4 })
	| (Schema5Protocol & { schemaVersion: 5 })
	| (Schema6Protocol & { schemaVersion: 6 })
	| (Schema7Protocol & { schemaVersion: 7 })
	| (Schema8Protocol & { schemaVersion: 8 });
