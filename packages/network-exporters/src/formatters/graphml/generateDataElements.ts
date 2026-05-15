import { DOMImplementation, type DocumentFragment } from '@xmldom/xmldom';

import type { Codebook } from '@codaco/protocol-validation';
import {
  edgeExportIDProperty,
  edgeSourceProperty,
  edgeTargetProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEgo,
  ncSourceUUID,
  ncTargetUUID,
  ncTypeProperty,
  ncUUIDProperty,
  nodeExportIDProperty,
} from '@codaco/shared-consts';

import type { EdgeWithResequencedID, NodeWithResequencedID } from '../../input';
import type { ExportOptions } from '../../options';
import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import {
  createDataElement,
  createDocumentFragment,
  deriveEntityType,
} from './helpers';
import processAttributes from './processAttributes';

/**
 * Function that returns a function that generates <data> elements for a given entity
 */
export default function getDataElementGenerator(
  codebook: Codebook,
  exportOptions: ExportOptions,
) {
  return async (
    entities: NodeWithResequencedID[] | NcEgo,
  ): Promise<DocumentFragment> => {
    const fragment = createDocumentFragment();

    if (!entities) {
      return fragment;
    }

    // If the entity is an object (not an array) it is an ego
    if (!Array.isArray(entities)) {
      const entityDataElements = await generateDataElementsForEntity(
        entities,
        codebook,
        exportOptions,
      );
      fragment.appendChild(entityDataElements);
    } else {
      // Process entities in parallel; append results in original order to preserve output stability
      const entityFragments = await Promise.all(
        entities.map((entity) =>
          generateDataElementsForEntity(entity, codebook, exportOptions),
        ),
      );
      for (const entityDataElements of entityFragments) {
        fragment.appendChild(entityDataElements);
      }
    }

    return fragment;
  };
}

async function generateDataElementsForEntity(
  entity: NodeWithResequencedID | EdgeWithResequencedID | NcEgo,
  codebook: Codebook,
  exportOptions: ExportOptions,
): Promise<DocumentFragment> {
  const fragment = createDocumentFragment();
  const dom = new DOMImplementation().createDocument(null, 'root', null);
  const entityType = deriveEntityType(entity);

  if (entityType === 'ego') {
    const keyDataElement = createDataElement(
      {
        key: ncUUIDProperty,
      },
      entity[entityPrimaryKeyProperty],
    );

    fragment.appendChild(keyDataElement);

    const dataElements = await processAttributes(
      entity,
      codebook,
      exportOptions,
    );

    fragment.appendChild(dataElements);

    return fragment;
  }

  // Create an element representing the entity (<node> or <edge>)
  const domElement = dom.createElement(entityType);

  // Set the id of the entity element to the export ID property
  domElement.setAttribute(
    'id',
    entityType === 'node'
      ? entity[nodeExportIDProperty].toString()
      : entity[edgeExportIDProperty].toString(),
  );

  // Create data element for entity UUID [networkCanvasUUID]
  domElement.appendChild(
    createDataElement(
      { key: ncUUIDProperty },
      entity[entityPrimaryKeyProperty],
    ),
  );

  // Create data element for entity type [networkCanvasType]
  const type = entity.type;
  const entityTypeName = codebook[entityType]?.[type]?.name ?? type;
  domElement.appendChild(
    createDataElement({ key: ncTypeProperty }, entityTypeName),
  );

  /**
   * Special handling for model variables and variables unique to entity type
   */
  if (entityType === 'edge') {
    // Add source and target properties and map them to the _from and _to attributes
    domElement.setAttribute('source', entity[edgeSourceProperty].toString());
    domElement.setAttribute('target', entity[edgeTargetProperty].toString());

    // Insert the nc UUID versions of 'to' and 'from' under special properties
    domElement.appendChild(
      createDataElement({ key: ncSourceUUID }, entity[ncSourceUUID]),
    );

    domElement.appendChild(
      createDataElement({ key: ncTargetUUID }, entity[ncTargetUUID]),
    );
  } else {
    const codebookDefinition = codebook.node?.[entity.type];
    const labelAttribute = getNodeLabelAttribute(
      codebookDefinition?.variables,
      entity[entityAttributesProperty],
    );

    if (labelAttribute) {
      // Add label property if attribute is not encrypted.
      const isEncrypted =
        codebookDefinition?.variables?.[labelAttribute]?.encrypted ?? false;

      if (isEncrypted) {
        domElement.appendChild(
          createDataElement({ key: 'label' }, 'Encrypted'),
        );
      } else {
        domElement.appendChild(
          createDataElement(
            { key: 'label' },
            entity[entityAttributesProperty][labelAttribute] as string,
          ),
        );
      }
    } else {
      domElement.appendChild(
        createDataElement(
          { key: 'label' },
          codebookDefinition?.name ?? entity[entityPrimaryKeyProperty],
        ),
      );
    }
  }

  const dataElements = await processAttributes(entity, codebook, exportOptions);
  domElement.appendChild(dataElements);
  fragment.appendChild(domElement);

  return fragment;
}
