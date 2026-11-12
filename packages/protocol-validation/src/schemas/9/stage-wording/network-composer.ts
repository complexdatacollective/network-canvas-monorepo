// When a Network Composer stage shows each of the words every such stage shows
// alike, which a protocol holds once as interface text
// (`interface-text-entries.ts`).

type Stage = Readonly<Record<string, unknown>>;

/** The Groups tool appears only once the stage has groups. */
export const hasGroups = (stage: Stage) =>
  stage.convexHullVariable !== undefined;

/** The edge tool appears only once the stage has edge types. */
export const hasEdgeTypes = (stage: Stage) => {
  const edges = stage.edges;
  return Array.isArray(edges) && edges.length > 0;
};

const isRecord = (value: unknown): value is Stage =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const edgeTypesOf = (stage: Stage): readonly Stage[] =>
  Array.isArray(stage.edges) ? stage.edges.filter(isRecord) : [];

/** A form the inspector shows: one with fields to answer. */
const hasFields = (form: unknown) =>
  isRecord(form) && Array.isArray(form.fields) && form.fields.length > 0;

/**
 * The inspector shows a form, and so can say that an undo or redo overtook an
 * edit in it, only for a selected node while the stage gives nodes fields to
 * answer, or for a selected edge of a type the stage gives fields.
 */
export const hasInspectorForm = (stage: Stage) =>
  hasFields(stage.nodeForm) ||
  edgeTypesOf(stage).some((edgeType) => hasFields(edgeType.form));

/**
 * Whether the codebook has an edge type the stage does not draw. An edge of
 * such a type, made on another stage, is the only one the inspector names
 * simply as a connection.
 */
export const leavesEdgeTypesUndrawn = (
  stage: Stage,
  codebookEdgeTypes: readonly string[],
) => {
  const drawn = new Set(
    edgeTypesOf(stage).flatMap(({ subject }) =>
      isRecord(subject) && typeof subject.type === 'string'
        ? [subject.type]
        : [],
    ),
  );
  return codebookEdgeTypes.some((type) => !drawn.has(type));
};
