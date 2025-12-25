import type {
	ClientJoinMessage,
	ClientMessage,
	CountryCode,
	Cursor,
	CursorId,
	ServerMessage,
} from "@codaco/cursor-field/shared";
import type * as Party from "partykit/server";

type ConnectionState = {
	cursorId: CursorId;
	countryCode: CountryCode;
	lastUpdate: number;
};

type SimulatedCursor = Cursor & {
	velocityX: number;
	velocityY: number;
	targetX: number;
	targetY: number;
	moveInterval: number;
	nextMoveTime: number;
};

const COUNTRY_CODES: CountryCode[] = [
	"GB",
	"US",
	"CA",
	"AU",
	"DE",
	"FR",
	"JP",
	"BR",
	"IN",
	"ZA",
	"NZ",
	"MX",
	"ES",
	"IT",
	"KR",
	"SE",
	"NL",
	"CH",
	"NO",
	"DK",
	"FI",
	"PL",
	"PT",
	"AR",
	"CL",
	"CO",
	"IE",
	"AT",
	"BE",
	"SG",
];

function randomInRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function generateSimId(): string {
	return `sim-${Math.random().toString(36).substring(2, 11)}`;
}

function createSimulatedCursor(): SimulatedCursor {
	const x = randomInRange(0.1, 0.9);
	const y = randomInRange(0.1, 0.9);
	const countryCode = COUNTRY_CODES[Math.floor(Math.random() * COUNTRY_CODES.length)] ?? "XX";

	return {
		id: generateSimId(),
		x,
		y,
		countryCode,
		lastUpdate: Date.now(),
		velocityX: 0,
		velocityY: 0,
		targetX: x,
		targetY: y,
		moveInterval: randomInRange(500, 2000),
		nextMoveTime: Date.now() + randomInRange(100, 1000),
	};
}

export default class CursorFieldServer implements Party.Server {
	private cursors: Map<string, Cursor> = new Map();
	private simulatedCursors: Map<string, SimulatedCursor> = new Map();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;
	private simulationInterval: ReturnType<typeof setInterval> | null = null;
	private isSimulating = false;

	private STALE_THRESHOLD = 10000;
	private CLEANUP_INTERVAL = 5000;
	private SIMULATION_TICK = 50;

	room: Party.Room;

	constructor(room: Party.Room) {
		this.room = room;
	}

	onStart(): void {
		this.cleanupInterval = setInterval(() => {
			this.cleanupStaleCursors();
		}, this.CLEANUP_INTERVAL);
	}

	async onRequest(req: Party.Request): Promise<Response> {
		const url = new URL(req.url);
		const path = url.pathname.split("/").pop();

		if (req.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				},
			});
		}

		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Content-Type": "application/json",
		};

		if (req.method === "GET" && path === "status") {
			return new Response(
				JSON.stringify({
					isSimulating: this.isSimulating,
					simulatedCount: this.simulatedCursors.size,
					realCount: this.cursors.size,
					totalCount: this.cursors.size + this.simulatedCursors.size,
				}),
				{ headers: corsHeaders },
			);
		}

		if (req.method === "POST" && path === "start") {
			const body = (await req.json().catch(() => ({}))) as { count?: number };
			const count = Math.min(Math.max(body.count ?? 8, 1), 50);
			this.startSimulation(count);
			return new Response(
				JSON.stringify({
					success: true,
					simulatedCount: this.simulatedCursors.size,
				}),
				{ headers: corsHeaders },
			);
		}

		if (req.method === "POST" && path === "stop") {
			this.stopSimulation();
			return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
		}

		if (req.method === "POST" && path === "add") {
			if (!this.isSimulating) {
				return new Response(JSON.stringify({ error: "Simulation not running" }), {
					status: 400,
					headers: corsHeaders,
				});
			}
			this.addSimulatedCursor();
			return new Response(
				JSON.stringify({
					success: true,
					simulatedCount: this.simulatedCursors.size,
				}),
				{ headers: corsHeaders },
			);
		}

		if (req.method === "POST" && path === "remove") {
			if (!this.isSimulating) {
				return new Response(JSON.stringify({ error: "Simulation not running" }), {
					status: 400,
					headers: corsHeaders,
				});
			}
			this.removeSimulatedCursor();
			return new Response(
				JSON.stringify({
					success: true,
					simulatedCount: this.simulatedCursors.size,
				}),
				{ headers: corsHeaders },
			);
		}

		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: corsHeaders,
		});
	}

	onConnect(conn: Party.Connection, ctx: Party.ConnectionContext): void {
		const countryCode = this.resolveCountryCode(ctx.request as unknown as Request);
		const cursorId = conn.id;

		const connectionState: ConnectionState = {
			cursorId,
			countryCode,
			lastUpdate: Date.now(),
		};
		conn.setState(connectionState);

		const welcome: ServerMessage = {
			type: "welcome",
			cursorId,
			countryCode,
			serverTime: Date.now(),
		};
		conn.send(JSON.stringify(welcome));

		const allCursors = [...this.cursors.values(), ...this.getSimulatedCursorsAsRegular()];
		const sync: ServerMessage = {
			type: "sync",
			cursors: allCursors,
		};
		conn.send(JSON.stringify(sync));
	}

	onMessage(message: string, sender: Party.Connection): void {
		let parsed: ClientMessage;

		try {
			parsed = JSON.parse(message) as ClientMessage;
		} catch {
			return;
		}

		const state = sender.state as ConnectionState | undefined;
		if (!state) {
			return;
		}

		switch (parsed.type) {
			case "join":
				this.handleJoin(sender, state, parsed);
				break;

			case "move":
				this.handleMove(sender, state, parsed);
				break;

			case "ping":
				this.handlePing(sender, parsed);
				break;
		}
	}

	onClose(conn: Party.Connection): void {
		const state = conn.state as ConnectionState | undefined;
		if (!state) return;

		this.cursors.delete(state.cursorId);

		const leave: ServerMessage = {
			type: "leave",
			cursorId: state.cursorId,
		};
		this.room.broadcast(JSON.stringify(leave), [conn.id]);
	}

	onError(_conn: Party.Connection, _error: Error): void {
		// Error handling is intentionally silent
	}

	private startSimulation(count: number): void {
		if (this.isSimulating) {
			this.stopSimulation();
		}

		this.isSimulating = true;

		for (let i = 0; i < count; i++) {
			const cursor = createSimulatedCursor();
			this.simulatedCursors.set(cursor.id, cursor);
			this.broadcastCursorUpdate(cursor);
		}

		this.simulationInterval = setInterval(() => {
			this.tickSimulation();
		}, this.SIMULATION_TICK);
	}

	private stopSimulation(): void {
		if (this.simulationInterval) {
			clearInterval(this.simulationInterval);
			this.simulationInterval = null;
		}

		for (const id of this.simulatedCursors.keys()) {
			const leave: ServerMessage = {
				type: "leave",
				cursorId: id,
			};
			this.room.broadcast(JSON.stringify(leave));
		}

		this.simulatedCursors.clear();
		this.isSimulating = false;
	}

	private addSimulatedCursor(): void {
		const cursor = createSimulatedCursor();
		this.simulatedCursors.set(cursor.id, cursor);
		this.broadcastCursorUpdate(cursor);
	}

	private removeSimulatedCursor(): void {
		const keys = Array.from(this.simulatedCursors.keys());
		if (keys.length > 0) {
			const keyToRemove = keys[Math.floor(Math.random() * keys.length)];
			if (keyToRemove) {
				this.simulatedCursors.delete(keyToRemove);
				const leave: ServerMessage = {
					type: "leave",
					cursorId: keyToRemove,
				};
				this.room.broadcast(JSON.stringify(leave));
			}
		}
	}

	private tickSimulation(): void {
		const now = Date.now();

		for (const cursor of this.simulatedCursors.values()) {
			if (now >= cursor.nextMoveTime) {
				cursor.targetX = clamp(cursor.x + randomInRange(-0.3, 0.3), 0.05, 0.95);
				cursor.targetY = clamp(cursor.y + randomInRange(-0.3, 0.3), 0.05, 0.95);
				cursor.nextMoveTime = now + cursor.moveInterval;
				cursor.moveInterval = randomInRange(500, 2000);
			}

			const dx = cursor.targetX - cursor.x;
			const dy = cursor.targetY - cursor.y;

			cursor.velocityX = cursor.velocityX * 0.9 + dx * 0.15;
			cursor.velocityY = cursor.velocityY * 0.9 + dy * 0.15;

			const newX = clamp(cursor.x + cursor.velocityX * 0.1, 0, 1);
			const newY = clamp(cursor.y + cursor.velocityY * 0.1, 0, 1);

			if (Math.abs(newX - cursor.x) > 0.001 || Math.abs(newY - cursor.y) > 0.001) {
				cursor.x = newX;
				cursor.y = newY;
				cursor.lastUpdate = now;
				this.broadcastCursorUpdate(cursor);
			}
		}
	}

	private broadcastCursorUpdate(cursor: Cursor | SimulatedCursor): void {
		const regularCursor: Cursor = {
			id: cursor.id,
			x: cursor.x,
			y: cursor.y,
			countryCode: cursor.countryCode,
			lastUpdate: cursor.lastUpdate,
			displayName: cursor.displayName,
			colour: cursor.colour,
		};

		const update: ServerMessage = {
			type: "update",
			cursor: regularCursor,
		};
		this.room.broadcast(JSON.stringify(update));
	}

	private getSimulatedCursorsAsRegular(): Cursor[] {
		return Array.from(this.simulatedCursors.values()).map((sim) => ({
			id: sim.id,
			x: sim.x,
			y: sim.y,
			countryCode: sim.countryCode,
			lastUpdate: sim.lastUpdate,
			displayName: sim.displayName,
			colour: sim.colour,
		}));
	}

	private handleJoin(conn: Party.Connection, state: ConnectionState, message: ClientJoinMessage): void {
		if (message.sessionId && message.sessionId !== state.cursorId) {
			this.cursors.delete(state.cursorId);

			state.cursorId = message.sessionId;
			conn.setState(state);
		}

		// Use client's locale-detected country code if provided, otherwise use IP-based detection
		const countryCode =
			message.countryCode && message.countryCode.length === 2 ? message.countryCode : state.countryCode;

		const cursor: Cursor = {
			id: state.cursorId,
			x: 0.5,
			y: 0.5,
			countryCode,
			lastUpdate: Date.now(),
			displayName: message.displayName,
		};

		this.cursors.set(state.cursorId, cursor);

		const update: ServerMessage = {
			type: "update",
			cursor,
		};
		this.room.broadcast(JSON.stringify(update), [conn.id]);
	}

	private handleMove(conn: Party.Connection, state: ConnectionState, message: { x: number; y: number }): void {
		const x = Math.max(0, Math.min(1, message.x));
		const y = Math.max(0, Math.min(1, message.y));

		const cursor = this.cursors.get(state.cursorId);
		if (!cursor) {
			return;
		}

		cursor.x = x;
		cursor.y = y;
		cursor.lastUpdate = Date.now();
		state.lastUpdate = cursor.lastUpdate;

		const update: ServerMessage = {
			type: "update",
			cursor,
		};
		this.room.broadcast(JSON.stringify(update), [conn.id]);
	}

	private handlePing(conn: Party.Connection, message: { timestamp: number }): void {
		const pong: ServerMessage = {
			type: "pong",
			clientTime: message.timestamp,
			serverTime: Date.now(),
		};
		conn.send(JSON.stringify(pong));
	}

	private cleanupStaleCursors(): void {
		const now = Date.now();
		const staleIds: CursorId[] = [];

		for (const [id, cursor] of this.cursors) {
			if (now - cursor.lastUpdate > this.STALE_THRESHOLD) {
				staleIds.push(id);
			}
		}

		for (const id of staleIds) {
			this.cursors.delete(id);

			const leave: ServerMessage = {
				type: "leave",
				cursorId: id,
			};
			this.room.broadcast(JSON.stringify(leave));
		}
	}

	private resolveCountryCode(request: Request): CountryCode {
		const cfCountry = request.headers.get("cf-ipcountry");

		if (cfCountry && cfCountry !== "XX" && cfCountry.length === 2) {
			return cfCountry.toUpperCase();
		}

		const vercelCountry = request.headers.get("x-vercel-ip-country");
		if (vercelCountry && vercelCountry.length === 2) {
			return vercelCountry.toUpperCase();
		}

		return "XX";
	}
}
