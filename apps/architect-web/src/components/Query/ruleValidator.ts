import { get } from "es-toolkit/compat";

const validateRules = (value: unknown): string | undefined => {
	// BUGFIX: If the section containing the filter is not expanded, we set
	// the filter value to null. In this case, we don't want to
	// validate the filter, because it will be invisible and will simply
	// prevent the form from being submitted without an error.
	if (!value) {
		return undefined;
	}
	const rules = get(value, "rules") as unknown[] | undefined;
	const join = get(value, "join");

	if (rules && rules.length > 1 && !join) {
		return "Please select a join type";
	}

	if (rules && rules.length === 0) {
		return "Please create at least one rule";
	}

	return undefined;
};

export default validateRules;
