/**
 * This module provides helpers for writing CSV output
 * @module CSV
 */

const csvEOL = "\r\n"; // always this, not os-specific

/**
 * Function to determine if a given value contains characters that are
 * difficult to encode, and should be quoted.
 * @param  {string} value a string to be considered
 * @return {boolean} if the string contains difficult to encode characters
 */
const containsDifficultCharacters = (string: string) => {
	const difficultCharacters = [
		'"', // Single quote
		",", // Comma
		"\r", // line ending
		"\n", // carriage return
	];

	return difficultCharacters.some((character) => string.includes(character));
};

/**
 * @param  {string} value a string potentially containing quotes
 * @return {string} a quote-delimited string, with internal quotation marks escaped (as '""')
 */
const quoteValue = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * Returned strings are already quote-escaped as needed.
 * You must not call quoteValue() on the return value of this method.
 * @param value any value to write to a CSV cell. If an object is passed,
 *              this will attempt to JSON.stringify, and fall back to
 * @return {string}
 */
const sanitizedCellValue = (value: unknown) => {
	if (value && typeof value === "object") {
		let serialized: string;
		try {
			serialized = JSON.stringify(value);
		} catch (_err) {
			serialized = (value as object).toString(); // value will never be null here
		}
		return quoteValue(serialized);
	}

	if (typeof value === "string") {
		let escapedValue = value;
		if (containsDifficultCharacters(value)) {
			escapedValue = quoteValue(value);
		}
		return escapedValue;
	}
	return value;
};

export { csvEOL, sanitizedCellValue };
