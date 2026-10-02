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
import { getOwn } from '../../utils/general';
import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import { createDataElement, createDocumentFragment } from './helpers';
import type { GraphMLKeyIds } from './keyIds';
import processAttributes from './processAttributes';

/**
 * Function that returns a function that generates <data> elements for a given entity
 */
export default function getDataElementGenerator(
  codebook: Codebook,
  exportOptions: ExportOptions,
  keyIds: GraphMLKeyIds,
) {
  return (
    entities: NodeWithResequencedID[] | EdgeWithResequencedID[] | NcEgo,
  ): DocumentFragment => {
    const fragment = createDocumentFragment();

    // If the entity is an object (not an array) it is an ego
    if (!Array.isArray(entities)) {
      fragment.appendChild(
        generateDataElementsForEntity(
          entities,
          codebook,
          exportOptions,
          keyIds,
        ),
      );
    } else {
      for (const entity of entities) {
        fragment.appendChild(
          generateDataElementsForEntity(
            entity,
            codebook,
            exportOptions,
            keyIds,
          ),
        );
      }
    }

    return fragment;
  };
}

function generateDataElementsForEntity(
  entity: NodeWithResequencedID | EdgeWithResequencedID | NcEgo,
  codebook: Codebook,
  exportOptions: ExportOptions,
  keyIds: GraphMLKeyIds,
): DocumentFragment {
  const fragment = createDocumentFragment();
  const dom = new DOMImplementation().createDocument(null, 'root', null);

  // Ego entities do not have a 'type' property
  if (!('type' in entity)) {
    const keyDataElement = createDataElement(
      { key: ncUUIDProperty },
      entity[entityPrimaryKeyProperty],
    );
    fragment.appendChild(keyDataElement);
    const dataElements = processAttributes(
      entity,
      codebook,
      exportOptions,
      keyIds,
    );
    fragment.appendChild(dataElements);
    return fragment;
  }

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
    const entityTypeName = getOwn(codebook.edge, edge.type)?.name ?? edge.type;
    domElement.appendChild(
      createDataElement({ key: ncTypeProperty }, entityTypeName),
    );
    domElement.setAttribute('source', edge[edgeSourceProperty]);
    domElement.setAttribute('target', edge[edgeTargetProperty]);
    domElement.appendChild(
      createDataElement({ key: ncSourceUUID }, edge[ncSourceUUID]),
    );
    domElement.appendChild(
      createDataElement({ key: ncTargetUUID }, edge[ncTargetUUID]),
    );
    const dataElements = processAttributes(
      edge,
      codebook,
      exportOptions,
      keyIds,
    );
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
  const entityTypeName = getOwn(codebook.node, node.type)?.name ?? node.type;
  domElement.appendChild(
    createDataElement({ key: ncTypeProperty }, entityTypeName),
  );

  const codebookDefinition = getOwn(codebook.node, node.type);
  const labelAttribute = getNodeLabelAttribute(
    codebookDefinition?.variables,
    node[entityAttributesProperty],
  );

  if (labelAttribute) {
    const isEncrypted =
      getOwn(codebookDefinition?.variables, labelAttribute)?.encrypted ?? false;
    if (isEncrypted) {
      domElement.appendChild(createDataElement({ key: 'label' }, 'Encrypted'));
    } else {
      const labelValue = node[entityAttributesProperty][labelAttribute];
      if (typeof labelValue === 'string' || typeof labelValue === 'number') {
        domElement.appendChild(
          createDataElement({ key: 'label' }, String(labelValue)),
        );
      }
    }
  } else {
    domElement.appendChild(
      createDataElement(
        { key: 'label' },
        codebookDefinition?.name ?? node[entityPrimaryKeyProperty],
      ),
    );
  }

  const dataElements = processAttributes(node, codebook, exportOptions, keyIds);
  domElement.appendChild(dataElements);
  fragment.appendChild(domElement);
  return fragment;
}
