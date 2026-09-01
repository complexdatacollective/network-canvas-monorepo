import { useId } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../../protocol-context.ts';

type EntityKind = CodebookSubject['entity'];

export type CodebookSurfaceProps = Readonly<{
  context: ProtocolBuilderProtocolContext;
  onCreateEntity?(entity: EntityKind): void;
  onEditEntity?(subject: CodebookSubject): void;
  onCreateVariable?(subject: CodebookSubject): void;
  onEditVariable?(subject: CodebookSubject, variableId: string): void;
}>;

type EntityCardProps = Readonly<{
  subject: CodebookSubject;
  name: string;
  variables: Readonly<Record<string, Readonly<{ name: string }>>>;
  onEditEntity?: CodebookSurfaceProps['onEditEntity'];
  onCreateVariable?: CodebookSurfaceProps['onCreateVariable'];
  onEditVariable?: CodebookSurfaceProps['onEditVariable'];
}>;

const subjectDescription = (subject: CodebookSubject, name: string): string => {
  if (subject.entity === 'node') return `Node type: ${name}`;
  if (subject.entity === 'edge') return `Edge type: ${name}`;
  return 'Ego attributes';
};

function EntityCard({
  subject,
  name,
  variables,
  onEditEntity,
  onCreateVariable,
  onEditVariable,
}: EntityCardProps) {
  const description = subjectDescription(subject, name);
  const variableEntries = Object.entries(variables).toSorted(
    ([firstId, first], [secondId, second]) =>
      first.name.localeCompare(second.name) || firstId.localeCompare(secondId),
  );

  return (
    <article aria-label={description}>
      <Surface spacing="sm" shadow="sm" noContainer>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Heading level="h3" margin="none">
                {name}
              </Heading>
              <Paragraph intent="smallText" emphasis="muted" margin="none">
                {description}
              </Paragraph>
            </div>
            {onEditEntity !== undefined && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Edit ${description}`}
                onClick={() => onEditEntity(subject)}
              >
                {subject.entity === 'ego' ? 'Manage attributes' : 'Edit type'}
              </Button>
            )}
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Heading level="h4" margin="none">
                Attributes
              </Heading>
              {onCreateVariable !== undefined && (
                <Button
                  type="button"
                  variant="dashed"
                  size="sm"
                  aria-label={`Create attribute for ${description}`}
                  onClick={() => onCreateVariable(subject)}
                >
                  Create attribute
                </Button>
              )}
            </div>

            {variableEntries.length === 0 ? (
              <Paragraph intent="smallText" emphasis="muted" margin="none">
                No attributes are defined.
              </Paragraph>
            ) : (
              <ul
                className="flex flex-col gap-2"
                aria-label={`${name} attributes`}
              >
                {variableEntries.map(([variableId, variable]) => (
                  <li
                    key={variableId}
                    className="bg-surface-2 text-surface-2-contrast flex min-w-0 flex-wrap items-center justify-between gap-3 rounded px-4 py-3"
                  >
                    <span className="min-w-0 wrap-break-word">
                      {variable.name}
                    </span>
                    {onEditVariable !== undefined && (
                      <Button
                        type="button"
                        variant="text"
                        size="sm"
                        aria-label={`Edit attribute ${variable.name} for ${description}`}
                        onClick={() => onEditVariable(subject, variableId)}
                      >
                        Edit
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Surface>
    </article>
  );
}

/** Package-owned codebook overview with no routing or host-store dependency. */
export default function CodebookSurface({
  context,
  onCreateEntity,
  onEditEntity,
  onCreateVariable,
  onEditVariable,
}: CodebookSurfaceProps) {
  const titleId = useId();
  const nodeTypesId = useId();
  const edgeTypesId = useId();
  const egoId = useId();
  const nodeEntries = Object.entries(context.codebook.node ?? {}).toSorted(
    ([firstId, first], [secondId, second]) =>
      first.name.localeCompare(second.name) || firstId.localeCompare(secondId),
  );
  const edgeEntries = Object.entries(context.codebook.edge ?? {}).toSorted(
    ([firstId, first], [secondId, second]) =>
      first.name.localeCompare(second.name) || firstId.localeCompare(secondId),
  );
  const ego = context.codebook.ego;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Heading id={titleId} level="h2" margin="none">
            Codebook
          </Heading>
          <Paragraph emphasis="muted" margin="none">
            Review entity types and the attributes each one owns.
          </Paragraph>
        </div>
        {onCreateEntity !== undefined && (
          <div
            className="flex flex-wrap gap-3"
            aria-label="Create codebook entity"
          >
            <Button
              type="button"
              color="primary"
              onClick={() => onCreateEntity('node')}
            >
              Create node type
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onCreateEntity('edge')}
            >
              Create edge type
            </Button>
            {ego === undefined && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onCreateEntity('ego')}
              >
                Add ego attributes
              </Button>
            )}
          </div>
        )}
      </div>

      {context.issues.length > 0 && (
        <Alert variant="warning" appearance="soft">
          <AlertTitle>Some codebook data could not be displayed</AlertTitle>
          <AlertDescription>
            <ul
              className="list-disc space-y-1 pl-5"
              aria-label="Codebook issues"
            >
              {context.issues.map((issue, index) => (
                <li key={`${issue.sectionId}:${issue.path.join(':')}:${index}`}>
                  <code>{issue.sectionId}</code>: {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-5" aria-labelledby={nodeTypesId}>
        <Heading id={nodeTypesId} level="h2" margin="none">
          Node types
        </Heading>
        {nodeEntries.length === 0 ? (
          <Paragraph emphasis="muted" margin="none">
            No valid node types are available.
          </Paragraph>
        ) : (
          nodeEntries.map(([type, definition]) => (
            <EntityCard
              key={type}
              subject={{ entity: 'node', type }}
              name={definition.name}
              variables={definition.variables ?? {}}
              onEditEntity={onEditEntity}
              onCreateVariable={onCreateVariable}
              onEditVariable={onEditVariable}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-5" aria-labelledby={edgeTypesId}>
        <Heading id={edgeTypesId} level="h2" margin="none">
          Edge types
        </Heading>
        {edgeEntries.length === 0 ? (
          <Paragraph emphasis="muted" margin="none">
            No valid edge types are available.
          </Paragraph>
        ) : (
          edgeEntries.map(([type, definition]) => (
            <EntityCard
              key={type}
              subject={{ entity: 'edge', type }}
              name={definition.name}
              variables={definition.variables ?? {}}
              onEditEntity={onEditEntity}
              onCreateVariable={onCreateVariable}
              onEditVariable={onEditVariable}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-5" aria-labelledby={egoId}>
        <Heading id={egoId} level="h2" margin="none">
          Ego
        </Heading>
        {ego === undefined ? (
          <Paragraph emphasis="muted" margin="none">
            No valid ego definition is available.
          </Paragraph>
        ) : (
          <EntityCard
            subject={{ entity: 'ego' }}
            name="Ego"
            variables={ego.variables ?? {}}
            onEditEntity={onEditEntity}
            onCreateVariable={onCreateVariable}
            onEditVariable={onEditVariable}
          />
        )}
      </div>
    </section>
  );
}
