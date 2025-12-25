export class FlagResolver {
	private readonly OFFSET = 127397;
	private cache: Map<string, string> = new Map();

	resolve(countryCode: string): string {
		const cached = this.cache.get(countryCode);
		if (cached) return cached;

		if (!countryCode || countryCode.length !== 2 || countryCode === "XX") {
			return "\u{1F310}"; // Globe emoji for unknown
		}

		const flag = countryCode
			.toUpperCase()
			.split("")
			.map((char) => String.fromCodePoint(char.charCodeAt(0) + this.OFFSET))
			.join("");

		this.cache.set(countryCode, flag);
		return flag;
	}

	preload(countryCodes: string[]): void {
		for (const code of countryCodes) {
			this.resolve(code);
		}
	}
}
