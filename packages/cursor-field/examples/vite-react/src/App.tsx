import { CursorField } from "@codaco/cursor-field/react";
import { useCallback, useEffect, useState } from "react";

const PARTY_HOST = import.meta.env.VITE_PARTY_HOST || "localhost:1999";
const ROOM = "example";

type SimulationStatus = {
	isSimulating: boolean;
	simulatedCount: number;
	realCount: number;
	totalCount: number;
};

function getSimulationApiUrl(endpoint: string): string {
	const protocol = window.location.protocol === "https:" ? "https:" : "http:";
	return `${protocol}//${PARTY_HOST}/party/${ROOM}/${endpoint}`;
}

export function App() {
	const [connectionState, setConnectionState] = useState<string>("disconnected");
	const [cursorCount, setCursorCount] = useState(0);
	const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const fetchStatus = useCallback(async () => {
		try {
			const res = await fetch(getSimulationApiUrl("status"));
			if (res.ok) {
				const data = (await res.json()) as SimulationStatus;
				setSimStatus(data);
			}
		} catch {
			// Server not available
		}
	}, []);

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 2000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	const startSimulation = async () => {
		setIsLoading(true);
		try {
			await fetch(getSimulationApiUrl("start"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ count: 12 }),
			});
			await fetchStatus();
		} finally {
			setIsLoading(false);
		}
	};

	const stopSimulation = async () => {
		setIsLoading(true);
		try {
			await fetch(getSimulationApiUrl("stop"), { method: "POST" });
			await fetchStatus();
		} finally {
			setIsLoading(false);
		}
	};

	const addCursor = async () => {
		await fetch(getSimulationApiUrl("add"), { method: "POST" });
		await fetchStatus();
	};

	const removeCursor = async () => {
		await fetch(getSimulationApiUrl("remove"), { method: "POST" });
		await fetchStatus();
	};

	return (
		<>
			<CursorField
				partyHost={PARTY_HOST}
				room={ROOM}
				onConnectionChange={setConnectionState}
				onCursorCountChange={setCursorCount}
				lineColour="rgba(100, 200, 255, 0.8)"
				lineMaxOpacity={0.7}
				cursorSize={32}
				showOwnCursor
			/>

			<main
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					minHeight: "100vh",
					padding: "2rem",
					textAlign: "center",
				}}
			>
				<h1 style={{ fontSize: "3rem", marginBottom: "1rem" }}>Cursor Field Demo</h1>

				<p style={{ fontSize: "1.25rem", opacity: 0.8, marginBottom: "2rem", maxWidth: "600px" }}>
					Move your cursor around to see it synchronised across all connected browsers. Enable server-side simulation to
					see fake cursors from around the world.
				</p>

				<div
					style={{
						display: "flex",
						gap: "2rem",
						padding: "1.5rem 2rem",
						background: "rgba(255, 255, 255, 0.1)",
						borderRadius: "12px",
						backdropFilter: "blur(10px)",
						marginBottom: "2rem",
					}}
				>
					<div>
						<div style={{ fontSize: "0.875rem", opacity: 0.6, marginBottom: "0.25rem" }}>Connection</div>
						<div
							style={{
								fontSize: "1.125rem",
								fontWeight: 600,
								color: connectionState === "connected" ? "#4ade80" : "#fbbf24",
							}}
						>
							{connectionState}
						</div>
					</div>

					<div>
						<div style={{ fontSize: "0.875rem", opacity: 0.6, marginBottom: "0.25rem" }}>Cursors Online</div>
						<div style={{ fontSize: "1.125rem", fontWeight: 600 }}>{cursorCount}</div>
					</div>

					{simStatus && (
						<>
							<div>
								<div style={{ fontSize: "0.875rem", opacity: 0.6, marginBottom: "0.25rem" }}>Simulated</div>
								<div style={{ fontSize: "1.125rem", fontWeight: 600, color: "#a78bfa" }}>
									{simStatus.simulatedCount}
								</div>
							</div>
							<div>
								<div style={{ fontSize: "0.875rem", opacity: 0.6, marginBottom: "0.25rem" }}>Real</div>
								<div style={{ fontSize: "1.125rem", fontWeight: 600, color: "#34d399" }}>{simStatus.realCount}</div>
							</div>
						</>
					)}
				</div>

				<div
					style={{
						padding: "1.5rem 2rem",
						background: "rgba(255, 255, 255, 0.1)",
						borderRadius: "12px",
						backdropFilter: "blur(10px)",
						maxWidth: "500px",
					}}
				>
					<h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem" }}>Server Simulation Controls</h3>

					<p style={{ margin: "0 0 1.5rem 0", fontSize: "0.875rem", opacity: 0.8, lineHeight: 1.6 }}>
						Control the server-side cursor simulation. Simulated cursors are broadcast to all connected clients through
						the real WebSocket connection.
					</p>

					<div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
						{simStatus?.isSimulating ? (
							<button
								type="button"
								onClick={stopSimulation}
								disabled={isLoading}
								style={{
									padding: "0.625rem 1.25rem",
									borderRadius: "8px",
									border: "none",
									background: "#ef4444",
									color: "white",
									fontWeight: 600,
									cursor: isLoading ? "not-allowed" : "pointer",
									opacity: isLoading ? 0.7 : 1,
								}}
							>
								Stop Simulation
							</button>
						) : (
							<button
								type="button"
								onClick={startSimulation}
								disabled={isLoading || connectionState !== "connected"}
								style={{
									padding: "0.625rem 1.25rem",
									borderRadius: "8px",
									border: "none",
									background: connectionState === "connected" ? "#22c55e" : "#6b7280",
									color: "white",
									fontWeight: 600,
									cursor: isLoading || connectionState !== "connected" ? "not-allowed" : "pointer",
									opacity: isLoading ? 0.7 : 1,
								}}
							>
								Start Simulation
							</button>
						)}

						<button
							type="button"
							onClick={addCursor}
							disabled={!simStatus?.isSimulating}
							style={{
								padding: "0.625rem 1.25rem",
								borderRadius: "8px",
								border: "none",
								background: simStatus?.isSimulating ? "#3b82f6" : "#6b7280",
								color: "white",
								fontWeight: 600,
								cursor: simStatus?.isSimulating ? "pointer" : "not-allowed",
							}}
						>
							+ Add Cursor
						</button>

						<button
							type="button"
							onClick={removeCursor}
							disabled={!simStatus?.isSimulating}
							style={{
								padding: "0.625rem 1.25rem",
								borderRadius: "8px",
								border: "none",
								background: simStatus?.isSimulating ? "#f59e0b" : "#6b7280",
								color: "white",
								fontWeight: 600,
								cursor: simStatus?.isSimulating ? "pointer" : "not-allowed",
							}}
						>
							- Remove Cursor
						</button>
					</div>
				</div>

				<p style={{ marginTop: "3rem", fontSize: "0.875rem", opacity: 0.5 }}>
					Run{" "}
					<code style={{ background: "rgba(255,255,255,0.1)", padding: "0.125rem 0.5rem", borderRadius: "4px" }}>
						pnpm --filter cursor-field-server dev
					</code>{" "}
					to start the local PartyKit server
				</p>
			</main>
		</>
	);
}
