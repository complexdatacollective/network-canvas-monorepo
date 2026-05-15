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
import { createDataElement, createDocumentFragment } from './helpers';
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

  // Ego entities do not have a 'type' property
  if (!('type' in entity)) {
    const keyDataElement = createDataElement(
      { key: ncUUIDProperty },
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

  // After ego check, entity is NodeWithResequencedID | EdgeWithResequencedID
  // Edge entities have an edgeExportIDProperty; node entities have nodeExportIDProperty
  if (edgeExportIDProperty in entity) {
    const edge = entity;
    const domElement = dom.createElement('edge');
    domElement.setAttribute('id', edge[edgeExportIDProperty].toString());
    domElement.appendChild(
      createDataElement(
        { key: ncUUIDProperty },
        edge[entityPrimaryKeyProperty],
      ),
    );
    const entityTypeName = codebook.edge?.[edge.type]?.name ?? edge.type;
    domElement.appendChild(
      createDataElement({ key: ncTypeProperty }, entityTypeName),
    );
    domElement.setAttribute('source', edge[edgeSourceProperty].toString());
    domElement.setAttribute('target', edge[edgeTargetProperty].toString());
    domElement.appendChild(
      createDataElement({ key: ncSourceUUID }, edge[ncSourceUUID]),
    );
    domElement.appendChild(
      createDataElement({ key: ncTargetUUID }, edge[ncTargetUUID]),
    );
    const dataElements = await processAttributes(edge, codebook, exportOptions);
    domElement.appendChild(dataElements);
    fragment.appendChild(domElement);
    return fragment;
  }

  const node = entity;
  const domElement = dom.createElement('node');
  domElement.setAttribute('id', node[nodeExportIDProperty].toString());
  domElement.appendChild(
    createDataElement({ key: ncUUIDProperty }, node[entityPrimaryKeyProperty]),
  );
  const entityTypeName = codebook.node?.[node.type]?.name ?? node.type;
  domElement.appendChild(
    createDataElement({ key: ncTypeProperty }, entityTypeName),
  );

  const codebookDefinition = codebook.node?.[node.type];
  const labelAttribute = getNodeLabelAttribute(
    codebookDefinition?.variables,
    node[entityAttributesProperty],
  );

  if (labelAttribute) {
    const isEncrypted =
      codebookDefinition?.variables?.[labelAttribute]?.encrypted ?? false;
    if (isEncrypted) {
      domElement.appendChild(createDataElement({ key: 'label' }, 'Encrypted'));
    } else {
      domElement.appendChild(
        createDataElement(
          { key: 'label' },
          node[entityAttributesProperty][labelAttribute] as string,
        ),
      );
    }
  } else {
    domElement.appendChild(
      createDataElement(
        { key: 'label' },
        codebookDefinition?.name ?? node[entityPrimaryKeyProperty],
      ),
    );
  }

  const dataElements = await processAttributes(node, codebook, exportOptions);
  domElement.appendChild(dataElements);
  fragment.appendChild(domElement);
  return fragment;
}
