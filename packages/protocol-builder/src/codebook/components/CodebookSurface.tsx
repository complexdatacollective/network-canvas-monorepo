import { useId } from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { EnclosingHeadingLevel } from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
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

/**
 * What each card and each of its controls is called.
 *
 * The entity, its name and the action are one sentence per case rather than a
 * noun spliced into a template: "Node type: Person" and "Edit Ego attributes"
 * put the kind of thing, its name and the verb in an order English happens to
 * use, and a translator has to be free to move all three. `name` is the
 * researcher's own name for a node or edge type and is never translated.
 */
const messages = defineMessages({
  subjectDescription: {
    id: 'protocolBuilder.codebookEntity.subjectDescription',
    defaultMessage:
      '{entity, select, node {Node type: {name}} edge {Edge type: {name}} other {Ego attributes}}',
    description:
      'Names one card of the codebook overview, and is the card’s accessible name. entity is node, edge or ego; name is the researcher’s own name for that node or edge type. The ego is the interview participant themselves, and has attributes but no type name.',
  },
  editSubject: {
    id: 'protocolBuilder.codebookEntity.editSubjectLabel',
    defaultMessage:
      '{entity, select, node {Edit Node type: {name}} edge {Edit Edge type: {name}} other {Edit Ego attributes}}',
    description:
      'Accessible name of the button that opens one codebook card for editing. entity is node, edge or ego; name is the researcher’s own name for that node or edge type. Names the card because the page shows one such button per card.',
  },
  createAttributeForSubject: {
    id: 'protocolBuilder.codebookEntity.createAttributeLabel',
    defaultMessage:
      '{entity, select, node {Create attribute for Node type: {name}} edge {Create attribute for Edge type: {name}} other {Create attribute for Ego attributes}}',
    description:
      'Accessible name of the button that adds an attribute (a codebook variable) to one entity. entity is node, edge or ego; name is the researcher’s own name for that node or edge type. Names the card because the page shows one such button per card.',
  },
  editAttributeForSubject: {
    id: 'protocolBuilder.codebookEntity.editAttributeLabel',
    defaultMessage:
      '{entity, select, node {Edit attribute {attributeName} for Node type: {name}} edge {Edit attribute {attributeName} for Edge type: {name}} other {Edit attribute {attributeName} for Ego attributes}}',
    description:
      'Accessible name of the button that opens one attribute (a codebook variable) for editing. attributeName is the researcher’s own name for the attribute; entity is node, edge or ego; name is their own name for that node or edge type.',
  },
  attributeListLabel: {
    id: 'protocolBuilder.codebookEntity.attributeListLabel',
    defaultMessage: '{name} attributes',
    description:
      'Accessible name of the list of one entity’s attributes (its codebook variables). name is the researcher’s own name for the node or edge type, or the word for the ego.',
  },
  manageAttributes: {
    id: 'protocolBuilder.codebookEntity.manageEgoAttributes',
    defaultMessage: 'Manage attributes',
    description:
      'Button on the ego card that opens its attribute list. The ego — the interview participant themselves — has attributes but no type properties, so the button offers those rather than editing a type.',
  },
  editType: {
    id: 'protocolBuilder.codebookEntity.editType',
    defaultMessage: 'Edit type',
    description:
      'Button on a node or edge card that opens the type’s own properties — its name, colour and appearance.',
  },
  attributesHeading: {
    id: 'protocolBuilder.codebookEntity.attributesHeading',
    defaultMessage: 'Attributes',
    description:
      'Heading over one entity’s attributes — the codebook variables recorded for it — on its card.',
  },
  createAttribute: {
    id: 'protocolBuilder.codebookEntity.createAttribute',
    defaultMessage: 'Create attribute',
    description:
      'Visible label of the button that adds a new attribute (a codebook variable) to the entity this card is about.',
  },
  noAttributes: {
    id: 'protocolBuilder.codebookEntity.noAttributes',
    defaultMessage: 'No attributes are defined.',
    description:
      'Shown on an entity’s card in place of its attribute list when the entity records none yet.',
  },
  editAttribute: {
    id: 'protocolBuilder.codebookEntity.editAttribute',
    defaultMessage: 'Edit',
    description:
      'Visible label of the button beside one attribute in an entity’s list. Its full accessible name names the attribute and the entity as well.',
  },
  title: {
    id: 'protocolBuilder.codebookEntity.codebookTitle',
    defaultMessage: 'Codebook',
    description:
      'Heading of the page listing a protocol’s entity types and their attributes. The codebook is the protocol’s definition of what an interview records.',
  },
  description: {
    id: 'protocolBuilder.codebookEntity.codebookDescription',
    defaultMessage: 'Review entity types and the attributes each one owns.',
    description:
      'Sentence under the codebook heading saying what the page is for. Entity types are the node and edge types a protocol defines; attributes are their codebook variables.',
  },
  createEntityGroupLabel: {
    id: 'protocolBuilder.codebookEntity.createEntityGroupLabel',
    defaultMessage: 'Create codebook entity',
    description:
      'Accessible name of the group holding the buttons that add a node type, an edge type or the ego definition to the codebook.',
  },
  createNodeType: {
    id: 'protocolBuilder.codebookEntity.createNodeType',
    defaultMessage: 'Create node type',
    description:
      'Button that adds a new node type to the codebook. A node is a member of the interview network.',
  },
  createEdgeType: {
    id: 'protocolBuilder.codebookEntity.createEdgeType',
    defaultMessage: 'Create edge type',
    description:
      'Button that adds a new edge type to the codebook. An edge is a relationship between two network members.',
  },
  addEgoAttributes: {
    id: 'protocolBuilder.codebookEntity.addEgoAttributes',
    defaultMessage: 'Add ego attributes',
    description:
      'Button that adds the ego definition to a codebook that has none. The ego is the interview participant themselves.',
  },
  issuesTitle: {
    id: 'protocolBuilder.codebookEntity.issuesTitle',
    defaultMessage: 'Some codebook data could not be displayed',
    description:
      'Heading of the warning listing parts of the stored codebook this page could not read.',
  },
  issuesListLabel: {
    id: 'protocolBuilder.codebookEntity.issuesListLabel',
    defaultMessage: 'Codebook issues',
    description:
      'Accessible name of the list of parts of the stored codebook this page could not read.',
  },
  nodeTypesHeading: {
    id: 'protocolBuilder.codebookEntity.nodeTypesHeading',
    defaultMessage: 'Node types',
    description:
      'Heading over the codebook’s node types. A node is a member of the interview network.',
  },
  noNodeTypes: {
    id: 'protocolBuilder.codebookEntity.noNodeTypes',
    defaultMessage: 'No valid node types are available.',
    description:
      'Shown in place of the node type list when the codebook defines none this page can read.',
  },
  edgeTypesHeading: {
    id: 'protocolBuilder.codebookEntity.edgeTypesHeading',
    defaultMessage: 'Edge types',
    description:
      'Heading over the codebook’s edge types. An edge is a relationship between two network members.',
  },
  noEdgeTypes: {
    id: 'protocolBuilder.codebookEntity.noEdgeTypes',
    defaultMessage: 'No valid edge types are available.',
    description:
      'Shown in place of the edge type list when the codebook defines none this page can read.',
  },
  ego: {
    id: 'protocolBuilder.codebookEntity.egoHeading',
    defaultMessage: 'Ego',
    description:
      'The word for the interview participant themselves, used both as the heading over their section of the codebook and as the name of their card.',
  },
  noEgoDefinition: {
    id: 'protocolBuilder.codebookEntity.noEgoDefinition',
    defaultMessage: 'No valid ego definition is available.',
    description:
      'Shown in place of the ego card when the codebook holds no ego definition this page can read. The ego is the interview participant themselves.',
  },
});

const subjectDescription = (
  subject: CodebookSubject,
  name: string,
  intl: IntlShape,
): string =>
  intl.formatMessage(messages.subjectDescription, {
    entity: subject.entity,
    name,
  });

function EntityCard({
  subject,
  name,
  variables,
  onEditEntity,
  onCreateVariable,
  onEditVariable,
}: EntityCardProps) {
  const intl = useAppIntl();
  const description = subjectDescription(subject, name, intl);
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
                aria-label={intl.formatMessage(messages.editSubject, {
                  entity: subject.entity,
                  name,
                })}
                onClick={() => onEditEntity(subject)}
              >
                {intl.formatMessage(
                  subject.entity === 'ego'
                    ? messages.manageAttributes
                    : messages.editType,
                )}
              </Button>
            )}
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Heading level="h4" margin="none">
                {intl.formatMessage(messages.attributesHeading)}
              </Heading>
              {onCreateVariable !== undefined && (
                <Button
                  type="button"
                  variant="dashed"
                  size="sm"
                  aria-label={intl.formatMessage(
                    messages.createAttributeForSubject,
                    { entity: subject.entity, name },
                  )}
                  onClick={() => onCreateVariable(subject)}
                >
                  {intl.formatMessage(messages.createAttribute)}
                </Button>
              )}
            </div>

            {variableEntries.length === 0 ? (
              <Paragraph intent="smallText" emphasis="muted" margin="none">
                {intl.formatMessage(messages.noAttributes)}
              </Paragraph>
            ) : (
              <ul
                className="flex flex-col gap-2"
                aria-label={intl.formatMessage(messages.attributeListLabel, {
                  name,
                })}
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
                        aria-label={intl.formatMessage(
                          messages.editAttributeForSubject,
                          {
                            attributeName: variable.name,
                            entity: subject.entity,
                            name,
                          },
                        )}
                        onClick={() => onEditVariable(subject, variableId)}
                      >
                        {intl.formatMessage(messages.editAttribute)}
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
  const intl = useAppIntl();
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
    // The page's own title is the `h2` below, and everything here sits under
    // it — so the level is stated rather than left to be guessed. An alert
    // derives its title's level from the nearest heading above it, and with
    // nothing saying what that is it falls back to `h4`: the codebook's
    // "some of this could not be read" warning rendered as an `h4` directly
    // under an `h2`, which axe reports as `heading-order` and which reads, to
    // anyone moving by headings, as a subsection that is not there.
    <EnclosingHeadingLevel level="h2">
      <section aria-labelledby={titleId} className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Heading id={titleId} level="h2" margin="none">
              {intl.formatMessage(messages.title)}
            </Heading>
            <Paragraph emphasis="muted" margin="none">
              {intl.formatMessage(messages.description)}
            </Paragraph>
          </div>
          {onCreateEntity !== undefined && (
            <div
              className="flex flex-wrap gap-3"
              aria-label={intl.formatMessage(messages.createEntityGroupLabel)}
            >
              <Button
                type="button"
                color="primary"
                onClick={() => onCreateEntity('node')}
              >
                {intl.formatMessage(messages.createNodeType)}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onCreateEntity('edge')}
              >
                {intl.formatMessage(messages.createEdgeType)}
              </Button>
              {ego === undefined && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onCreateEntity('ego')}
                >
                  {intl.formatMessage(messages.addEgoAttributes)}
                </Button>
              )}
            </div>
          )}
        </div>

        {context.issues.length > 0 && (
          <Alert variant="warning" appearance="soft">
            <AlertTitle>{intl.formatMessage(messages.issuesTitle)}</AlertTitle>
            <AlertDescription>
              <ul
                className="list-disc space-y-1 pl-5"
                aria-label={intl.formatMessage(messages.issuesListLabel)}
              >
                {/* An issue's message is a plain string carrying either this
                    package's own encoded descriptor or the protocol schema's own
                    wording, so it is decoded below and passed through untouched
                    when it is not one of ours. */}
                {context.issues.map((issue, index) => (
                  <li
                    key={`${issue.sectionId}:${issue.path.join(':')}:${index}`}
                  >
                    <code>{issue.sectionId}</code>:{' '}
                    {formatMessageError(issue.message, intl) ?? issue.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-5" aria-labelledby={nodeTypesId}>
          <Heading id={nodeTypesId} level="h2" margin="none">
            {intl.formatMessage(messages.nodeTypesHeading)}
          </Heading>
          {nodeEntries.length === 0 ? (
            <Paragraph emphasis="muted" margin="none">
              {intl.formatMessage(messages.noNodeTypes)}
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
            {intl.formatMessage(messages.edgeTypesHeading)}
          </Heading>
          {edgeEntries.length === 0 ? (
            <Paragraph emphasis="muted" margin="none">
              {intl.formatMessage(messages.noEdgeTypes)}
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
            {intl.formatMessage(messages.ego)}
          </Heading>
          {ego === undefined ? (
            <Paragraph emphasis="muted" margin="none">
              {intl.formatMessage(messages.noEgoDefinition)}
            </Paragraph>
          ) : (
            <EntityCard
              subject={{ entity: 'ego' }}
              name={intl.formatMessage(messages.ego)}
              variables={ego.variables ?? {}}
              onEditEntity={onEditEntity}
              onCreateVariable={onCreateVariable}
              onEditVariable={onEditVariable}
            />
          )}
        </div>
      </section>
    </EnclosingHeadingLevel>
  );
}
