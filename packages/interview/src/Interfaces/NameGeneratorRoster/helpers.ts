import type { getNodeVariables } from "~/lib/interviewer/selectors/interface";
import type { StageProps } from "~/lib/interviewer/types";
import getParentKeyByNameValue from "~/lib/interviewer/utils/getParentKeyByNameValue";

export const convertNamesToUUIDs = (variables: ReturnType<typeof getNodeVariables>, nameOrNames: string[]) => {
	return nameOrNames.map((name) => getParentKeyByNameValue(variables, name));
};

export type NameGeneratorRosterProps = StageProps<"NameGeneratorRoster">;
