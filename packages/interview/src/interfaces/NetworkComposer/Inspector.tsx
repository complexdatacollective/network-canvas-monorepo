'use client';

import type { ReactNode } from 'react';

import type { TitlelessForm } from '@codaco/protocol-validation';
import {
  type entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import type { Subject } from '~/selectors/forms';

import SlidesForm from '../SlidesForm/SlidesForm';

type NodeInspectorProps = {
  selectedNode: NcNode;
  nodeForm: TitlelessForm;
  subject: Subject;
  onUpdateNode: (
    id: string,
    data: NcNode[typeof entityAttributesProperty],
  ) => void;
  onDeleteNode: (id: string) => void;
};

type EdgeInspectorProps = {
  selectedEdge: NcEdge;
  edgeForm: TitlelessForm;
  onUpdateEdge: (
    id: string,
    data: NcEdge[typeof entityAttributesProperty],
  ) => void;
  onDeleteEdge: (id: string) => void;
};

export type InspectorProps =
  | ({ kind: 'node' } & NodeInspectorProps)
  | ({ kind: 'edge' } & EdgeInspectorProps);

function renderNullHeader(): ReactNode {
  return null;
}

function NodeInspector({
  selectedNode,
  nodeForm,
  subject,
  onUpdateNode,
  onDeleteNode,
}: NodeInspectorProps) {
  const nodeId = selectedNode[entityPrimaryKeyProperty];

  return (
    <div
      data-testid="inspector-panel"
      className="flex flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-auto flex-col overflow-hidden">
        <SlidesForm
          items={[selectedNode]}
          form={nodeForm}
          subject={subject}
          updateItem={onUpdateNode}
          renderHeader={renderNullHeader}
          form_kind="alter"
        />
      </div>
      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={() => onDeleteNode(nodeId)}
          className="bg-destructive text-destructive-contrast rounded px-4 py-2 hover:opacity-90"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function EdgeInspector({
  selectedEdge,
  edgeForm,
  onUpdateEdge,
  onDeleteEdge,
}: EdgeInspectorProps) {
  const edgeId = selectedEdge[entityPrimaryKeyProperty];
  const edgeSubject: Subject = { entity: 'edge', type: selectedEdge.type };

  return (
    <div
      data-testid="inspector-panel"
      className="flex flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-auto flex-col overflow-hidden">
        <SlidesForm
          items={[selectedEdge]}
          form={edgeForm}
          subject={edgeSubject}
          updateItem={(id, data) => onUpdateEdge(id, data)}
          renderHeader={renderNullHeader}
          form_kind="alter_edge"
        />
      </div>
      <div className="shrink-0 p-2">
        <button
          type="button"
          onClick={() => onDeleteEdge(edgeId)}
          className="bg-destructive text-destructive-contrast rounded px-4 py-2 hover:opacity-90"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function Inspector(props: InspectorProps) {
  if (props.kind === 'node') {
    return <NodeInspector {...props} />;
  }
  return <EdgeInspector {...props} />;
}
