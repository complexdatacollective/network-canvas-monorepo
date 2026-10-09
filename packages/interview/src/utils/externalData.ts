import { includes, toNumber } from 'es-toolkit/compat';

import {
  type Codebook,
  type StageSubject,
  type VariableType,
  VariableTypes,
} from '@codaco/protocol-validation';
import {
  type EntityAttributesProperty,
  entityAttributesProperty,
  type NcNode,
} from '@codaco/shared-consts';

/**
 * Attribute and variable keys here are researcher-chosen text, so they are read
 * as own properties only, and never as lodash paths: a key containing a dot or
 * a bracket is a key, not a path, and `constructor` or `__proto__` must not
 * resolve to anything on `Object.prototype`.
 */
const getOwn = <T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined =>
  record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;

const getCodebookVariable = (
  codebookDefinition: ReturnType<typeof getCodebookDefinition>,
  variableId: string,
) => getOwn(codebookDefinition?.variables, variableId);

/**
 * Try to determine the type of an attribute based on data across all nodes
 * in a nodeList. This is a best effort approach, and may not be accurate.
 *
 * We default to text if we can't determine the type, or if the type is
 * inconsistent across nodes.
 * @param attributeKey
 * @param nodeList
 * @returns
 */
const deriveAttributeTypeFromData = (
  attributeKey: string,
  nodeList: NcNode[],
) =>
  nodeList.reduce((previousType, node) => {
    const currentValue = getOwn(node[entityAttributesProperty], attributeKey);

    // if the value is null or undefined, defer to the previous type
    if (!currentValue || previousType === VariableTypes.text) {
      return previousType;
    }

    let currentType = '';

    // If the value can be parsed as a number, set the type to number
    if (!Number.isNaN(toNumber(currentValue))) {
      currentType = VariableTypes.number;
    }

    // If the value can be parsed as a boolean, set the type to boolean
    if (
      typeof currentValue === 'string' &&
      (currentValue.toLowerCase() === 'true' ||
        currentValue.toLowerCase() === 'false')
    ) {
      currentType = VariableTypes.boolean;
    }

    // could insert regex for array/object detection, but not helpful if not in the codebook

    // fallback to text if a conflict emerges, or first instance of non-null data
    if (
      (previousType !== '' && currentType !== previousType) ||
      currentType === ''
    ) {
      return VariableTypes.text;
    }
    return currentType as VariableType;
  }, '');

const getAttributeTypes = (
  uniqueAttributeKeys: string[],
  nodeList: NcNode[],
  protocolCodebook: Codebook,
  stageSubject: StageSubject,
): Record<string, VariableType> => {
  return uniqueAttributeKeys.reduce(
    (acc, attributeKey) => {
      const codebookDefinition = getCodebookDefinition(
        protocolCodebook,
        stageSubject,
      )!;
      const codebookType = getCodebookVariable(
        codebookDefinition,
        attributeKey,
      )?.type;

      if (codebookType && includes(VariableTypes, codebookType)) {
        return {
          ...acc,
          [attributeKey]: codebookType,
        };
      }

      // Handle possible categorical or layout variables
      if (attributeKey.includes('_')) {
        const uuid = attributeKey.substring(0, attributeKey.indexOf('_'));
        const option = attributeKey.substring(attributeKey.indexOf('_'));
        const optionCodebookType = getCodebookVariable(
          codebookDefinition,
          uuid,
        )?.type;
        if (optionCodebookType && includes(VariableTypes, optionCodebookType)) {
          if (option === '_x' || option === '_y') {
            return {
              ...acc,
              [attributeKey]: `${optionCodebookType}${option}` as VariableType,
            };
          }
          return {
            ...acc,
            [attributeKey]: `${optionCodebookType}_option` as VariableType,
          };
        }
      }

      const derivedType = deriveAttributeTypeFromData(
        attributeKey,
        nodeList,
      ) as VariableType;

      return {
        ...acc,
        [attributeKey]: derivedType,
      };
    },
    {} as Record<string, VariableType>,
  );
};

const getCodebookDefinition = (
  protocolCodebook: Codebook,
  stageSubject: StageSubject,
) => {
  const entityType = stageSubject.entity;
  if (entityType === 'ego') {
    return protocolCodebook.ego;
  }

  const stageNodeType = stageSubject.type;
  return protocolCodebook[entityType]?.[stageNodeType];
};

// compile list of attributes from a nodelist that aren't already in the codebook
const getUniqueAttributeKeys = (
  nodeList: NcNode[],
  protocolCodebook: Codebook,
  stageSubject: StageSubject,
) =>
  nodeList.reduce((attributeKeys: string[], node) => {
    const codebookDefinition = getCodebookDefinition(
      protocolCodebook,
      stageSubject,
    );
    const variables = Object.keys(node[entityAttributesProperty]);
    const nonCodebookVariables = variables.filter(
      (attributeKey) => !getCodebookVariable(codebookDefinition, attributeKey),
    );
    const novelVariables = nonCodebookVariables.filter(
      (attributeKey) => !attributeKeys.includes(attributeKey),
    );
    return [...attributeKeys, ...novelVariables];
  }, []);

/**
 * The codebook's own option value for the text found in a `<variable>_<option>`
 * column header. The header only has the option as text, so reading it back
 * through JSON.parse would turn an option named `null` or `"x"` into something
 * else; the codebook knows whether the value is a string, number or boolean.
 * Compared in NFC so a header spelled decomposed still finds the option.
 */
const resolveCategoricalOption = (
  variable: ReturnType<typeof getCodebookVariable>,
  optionText: string,
) => {
  if (variable?.type !== 'categorical') {
    return optionText;
  }

  const target = optionText.normalize('NFC');

  return (
    variable.options.find(
      (option) => String(option.value).normalize('NFC') === target,
    )?.value ?? optionText
  );
};

const getNodeListUsingTypes = (
  nodeList: NcNode[],
  protocolCodebook: Codebook,
  stageSubject: StageSubject,
  derivedAttributeTypes: Record<string, string>,
) =>
  nodeList.map((node) => {
    const codebookDefinition = getCodebookDefinition(
      protocolCodebook,
      stageSubject,
    );
    const attributes: NcNode[EntityAttributesProperty] = Object.entries(
      node[entityAttributesProperty],
    ).reduce<NcNode[EntityAttributesProperty]>(
      (consolidatedAttributes, [attributeKey, attributeValue]) => {
        if (
          attributeValue === null ||
          attributeValue === undefined ||
          attributeValue === ''
        ) {
          return consolidatedAttributes;
        }

        let codebookType = getCodebookVariable(
          codebookDefinition,
          attributeKey,
        )?.type;

        if (!Object.values(VariableTypes).includes(codebookType!)) {
          codebookType = getOwn(
            derivedAttributeTypes,
            attributeKey,
          ) as VariableType;
        }

        switch (codebookType) {
          case VariableTypes.boolean: {
            return {
              ...consolidatedAttributes,
              // eslint-disable-next-line @typescript-eslint/no-base-to-string
              [attributeKey]: String(attributeValue).toLowerCase() === 'true',
            };
          }
          case VariableTypes.number:
          case VariableTypes.scalar: {
            return {
              ...consolidatedAttributes,
              [attributeKey]: Number(attributeValue),
            };
          }
          case VariableTypes.categorical:
          case VariableTypes.ordinal:
          case VariableTypes.layout: {
            try {
              const value = JSON.parse(attributeValue as string) as {
                x: number;
                y: number;
              };

              return {
                ...consolidatedAttributes,
                [attributeKey]: value,
              };
            } catch {
              return {
                ...consolidatedAttributes,
                [attributeKey]: attributeValue,
              };
            }
          }
          // Handle column names with _x and _y suffixes, indicating this is a file we created
          case `${VariableTypes.layout}_x`: {
            const uuid = attributeKey.substring(0, attributeKey.indexOf('_'));
            return {
              ...consolidatedAttributes,
              [uuid]: {
                ...(consolidatedAttributes[uuid] as { x: number; y: number }),
                x: Number(attributeValue),
              },
            };
          }
          case `${VariableTypes.layout}_y`: {
            const uuid = attributeKey.substring(0, attributeKey.indexOf('_'));
            return {
              ...consolidatedAttributes,
              [uuid]: {
                ...(consolidatedAttributes[uuid] as { x: number; y: number }),
                y: Number(attributeValue),
              },
            };
          }
          // Handle column names with _option suffixes, indicating this is a file we created
          case `${VariableTypes.categorical}_option`: {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            if (String(attributeValue).toLowerCase() === 'true') {
              const uuid = attributeKey.substring(0, attributeKey.indexOf('_'));
              const option = resolveCategoricalOption(
                getCodebookVariable(codebookDefinition, uuid),
                attributeKey.substring(attributeKey.indexOf('_') + 1),
              );
              const previous = getOwn(consolidatedAttributes, uuid);
              return {
                ...consolidatedAttributes,
                [uuid]: [...(Array.isArray(previous) ? previous : []), option],
              };
            }
            return consolidatedAttributes;
          }
          case VariableTypes.datetime:
          case VariableTypes.text:
          case VariableTypes.location:
          case undefined:
          default:
            return {
              ...consolidatedAttributes,
              [attributeKey]: attributeValue,
            };
        }
      },
      {} as NcNode[EntityAttributesProperty],
    );

    return {
      ...node,
      [entityAttributesProperty]: attributes,
    };
  });

// Cast types for data based on codebook and data, according to stage subject.
const withTypeReplacement = (
  nodeList: NcNode[],
  protocolCodebook: Codebook,
  stageSubject: StageSubject,
) => {
  const uniqueAttributeKeys = getUniqueAttributeKeys(
    nodeList,
    protocolCodebook,
    stageSubject,
  );

  const codebookAttributeTypes = getAttributeTypes(
    uniqueAttributeKeys,
    nodeList,
    protocolCodebook,
    stageSubject,
  );

  // make substitutes using codebook first, then column data derivation
  return getNodeListUsingTypes(
    nodeList,
    protocolCodebook,
    stageSubject,
    codebookAttributeTypes,
  );
};

export const getVariableTypeReplacements = (
  sourceFile: string,
  uuidData: NcNode[],
  protocolCodebook: Codebook,
  stageSubject: StageSubject,
) => {
  const fileExtension = (fileName: string) => fileName.split('.').pop();
  const fileType = fileExtension(sourceFile) === 'csv' ? 'csv' : 'json';
  if (fileType === 'csv') {
    return withTypeReplacement(uuidData, protocolCodebook, stageSubject);
  }
  return uuidData;
};
