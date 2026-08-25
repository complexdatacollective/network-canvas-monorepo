import { useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';

import Section from '@codaco/fresco-ui/Section';
import { Subsection } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import EditableAttributesList from '~/components/Form/arrayFields/EditableAttributesList';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import { getCodebook } from '~/selectors/protocol';

import { useComposerFieldCommit } from '../Form/fieldCommit';
import EdgeTypeMultiSelectField from './EdgeTypeMultiSelect';
type EdgeEntry = {
  id: string;
  subject: {
    entity: 'edge';
    type: string;
  };
  form?: Record<string, unknown>;
};
const hasStringProp = (value: object, key: string): boolean =>
  typeof Reflect.get(value, key) === 'string';
const isEdgeEntry = (value: unknown): value is EdgeEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!hasStringProp(value, 'id') || !('subject' in value)) {
    return false;
  }
  const { subject } = value;
  return (
    typeof subject === 'object' &&
    subject !== null &&
    Reflect.get(subject, 'entity') === 'edge' &&
    hasStringProp(subject, 'type')
  );
};
const toEdgeEntries = (value: unknown): EdgeEntry[] =>
  Array.isArray(value) ? value.filter(isEdgeEntry) : [];

/** Stable empty array, so an attribute-less edge type keeps a stable value. */
const NO_FIELDS: Record<string, unknown>[] = [];

const toFields = (form: Record<string, unknown> | undefined) =>
  Array.isArray(form?.fields)
    ? (form.fields as Record<string, unknown>[])
    : NO_FIELDS;

type EdgeAttributeBlockProps = {
  entity: 'edge';
  id: string;
  type: string;
  fieldName: string;
  editFormName: string;
  title: string;
  /** This edge type's own name, as the codebook holds it. */
  edgeLabel: string;
  fields: Record<string, unknown>[];
  onFieldsChange: (edgeId: string, fields: Record<string, unknown>[]) => void;
};
// `useComposerFieldCommit({entity, type})` is called here, with THIS block's
// own edge type — not the stage's own subject — so each edge type's
// attribute list commits into the right codebook entry rather than a shared
// (and wrong) one.
const EdgeAttributeBlock = ({
  entity,
  id,
  type,
  fieldName,
  editFormName,
  title,
  edgeLabel,
  fields,
  onFieldsChange,
}: EdgeAttributeBlockProps) => {
  const handleChangeFields = useComposerFieldCommit({ entity, type });
  // Addressed by the edge's own id rather than by its position: the list this
  // writes back into is the one the researcher can delete from, and a delete
  // re-indexes everything after it.
  const handleChange = useCallback(
    // `undefined` is the list's empty case; the container keeps an array so
    // the edge entry's shape stays stable (`prune` drops the empty container
    // at commit anyway).
    (nextFields: Record<string, unknown>[] | undefined) =>
      onFieldsChange(id, nextFields ?? []),
    [id, onFieldsChange],
  );

  return (
    <Section
      title={title}
      description="Configure the attributes collected for this connection type."
    >
      <Subsection
        title="Editable attributes"
        summary="The attributes shown in the side panel when an edge is selected, so they can be edited during the interview. Each attribute is paired with the input control used to collect it."
      >
        <EditableAttributesList
          fieldName={fieldName}
          entity={entity}
          type={type}
          editFormName={editFormName}
          // One list per selected edge type, all on one screen, so the edge
          // type's own name is the only thing that tells its add button from
          // the next one's. A placeholder for a name the researcher authored,
          // not a sentence assembled from fragments.
          addButtonLabel={`Create new attribute for ${edgeLabel}`}
          handleChangeFields={handleChangeFields}
          value={fields}
          onChange={handleChange}
        />
      </Subsection>
    </Section>
  );
};
const resolveEdgeLabel = (
  codebook: ReturnType<typeof getCodebook>,
  type: string,
) => codebook?.edge?.[type]?.name ?? type;
const EdgeConfiguration = (_props: StageEditorSectionProps) => {
  const codebook = useSelector(getCodebook);
  const edges = toEdgeEntries(useStageFormValue('edges'));
  const initialEdges = useStageInitialValue<EdgeEntry[]>('edges');
  const setStageValue = useSetStageValue();

  // `edges` is ONE registered field holding the whole array, and each edge
  // type's attribute list is part of that value rather than a field of its
  // own — the governing rule for every array in the stage form (see
  // `ArchitectArrayField`). A per-index leaf would be named positionally over
  // a list the researcher deletes from, and the form store keys fields by name
  // alone: removing one edge type re-indexes the survivors onto names the
  // removed blocks have just parked their values under, which
  // `registerField` then prefers over `initialValue`.
  //
  // Read at write time rather than closed over, so a row save that lands after
  // another edit (the attribute dialog's save is async) writes onto the
  // CURRENT array instead of resurrecting the one its render captured. Matching
  // on the edge's own id also makes a save that outlives its edge TYPE a
  // no-op — there is no longer anything to write it to, and the positional
  // leaf it used to land on now belongs to a different type.
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const handleFieldsChange = useCallback(
    (edgeId: string, fields: Record<string, unknown>[]) => {
      setStageValue(
        'edges',
        edgesRef.current.map((entry) =>
          entry.id === edgeId
            ? { ...entry, form: { ...entry.form, fields } }
            : entry,
        ),
      );
    },
    [setStageValue],
  );

  return (
    <>
      <Section
        title="Edge configuration"
        description="Define the connection types participants can draw and the attributes collected for each type."
      >
        <Subsection
          title="Connection types"
          summary="Select the edge types participants can create on the canvas. Each selected type gets its own set of editable attributes below."
        >
          <ArchitectField
            name="edges"
            label="Edge types"
            component={EdgeTypeMultiSelectField}
            initialValue={initialEdges}
          />
        </Subsection>
      </Section>
      {edges.map((edge, index) => (
        <EdgeAttributeBlock
          key={edge.id}
          entity="edge"
          id={edge.id}
          type={edge.subject.type}
          // Not a registered field name: the list is controlled. It is still
          // the path this array occupies in the saved stage, which is what the
          // Issues panel anchors on and what E2E specs target through
          // `data-field-name`.
          fieldName={`edges[${index}].form.fields`}
          editFormName={`edge-attr-edit-${edge.subject.type}`}
          title={`Edge Attributes — ${resolveEdgeLabel(codebook, edge.subject.type)}`}
          edgeLabel={resolveEdgeLabel(codebook, edge.subject.type)}
          fields={toFields(edge.form)}
          onFieldsChange={handleFieldsChange}
        />
      ))}
    </>
  );
};
export default EdgeConfiguration;
