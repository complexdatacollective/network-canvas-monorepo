import type { getNodeVariables } from '~/selectors/interface';
import type { StageProps } from '~/types';
import getParentKeyByNameValue from '~/utils/getParentKeyByNameValue';

export const convertNamesToUUIDs = (
  variables: ReturnType<typeof getNodeVariables>,
  nameOrNames: string[],
) => {
  return nameOrNames.map((name) => getParentKeyByNameValue(variables, name));
};

export type NameGeneratorRosterProps = StageProps<'NameGeneratorRoster'>;
