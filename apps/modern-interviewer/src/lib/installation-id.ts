import { v4 as uuid } from "uuid";

const KEY = "modern-interviewer.installationId";

export function getInstallationId(): string {
	if (typeof window === "undefined") return "ssr";
	const existing = window.localStorage.getItem(KEY);
	if (existing) return existing;
	const next = uuid();
	window.localStorage.setItem(KEY, next);
	return next;
}
