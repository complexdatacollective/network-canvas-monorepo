export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	try {
		const d = new Date(iso);
		return d.toLocaleString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

export function formatBytes(size: number): string {
	if (!Number.isFinite(size) || size <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"] as const;
	let idx = 0;
	let value = size;
	while (value >= 1024 && idx < units.length - 1) {
		value /= 1024;
		idx += 1;
	}
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[idx]}`;
}

export function truncate(text: string, max = 80): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}
