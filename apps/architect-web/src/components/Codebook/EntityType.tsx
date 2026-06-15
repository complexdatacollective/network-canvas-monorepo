import { useState } from 'react';
import { compose, withHandlers } from 'react-recompose';
import { connect } from 'react-redux';
import { Link } from 'wouter';

import type { NodeShape } from '@codaco/fresco-ui/Node';
import { Section } from '~/components/EditorLayout';
import NewVariableWindow from '~/components/NewVariableWindow/NewVariableWindow';
import { actionCreators as dialogActionCreators } from '~/ducks/modules/dialogs';
import { deleteTypeAsync } from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';
import { Button } from '~/lib/legacy-ui/components';

import EntityIcon from './EntityIcon';
import { getEntityProperties } from './helpers';
import Tag from './Tag';
import Variables from './Variables';

type Entity = 'node' | 'edge' | 'ego';

type UsageItem = {
  id?: string;
  label: string;
};

type Variable = {
  id: string;
  name: string;
  component: string;
  inUse: boolean;
  usage: UsageItem[];
  usageString?: string;
};

type VariablesComponentProps = {
  variables: Variable[];
  entity: Entity;
  type?: string;
};

// Props expected by the unwrapped component
type EntityTypeProps = {
  entity: Entity;
  type: string;
  name: string;
  color: string;
  shape?: NodeShape;
  usage: UsageItem[];
  inUse?: boolean;
  handleDelete?: () => void;
  handleEdit?: () => void;
  variables?: Record<string, Variable>;
};

const EntityType = ({
  name,
  color,
  shape,
  inUse = true,
  usage,
  entity,
  type,
  variables = {},
  handleEdit = () => {},
  handleDelete = () => {},
}: EntityTypeProps) => {
  const [showAddVariable, setShowAddVariable] = useState(false);

  const variableArray = Object.values(variables);
  const VariablesTyped =
    Variables as unknown as React.ComponentType<VariablesComponentProps>;

  const stages = usage.map(({ id, label }) => {
    // If there is no id, don't create a link. This is the case for
    // usages that are only present as validation options.
    if (!id) {
      return <Tag key={`validation-${label}`}>{label}</Tag>;
    }

    return (
      <Link key={id} href={`/protocol/stage/${id}`}>
        <Tag>{label}</Tag>
      </Link>
    );
  });

  return (
    <Section layout="vertical" required={false}>
      <div className="flex items-center gap-(--space-md)">
        <div className="flex shrink-0 basis-(--space-3xl) items-center justify-center">
          <EntityIcon
            color={color}
            entity={entity}
            shape={shape}
            size="small"
          />
        </div>
        <h2 className="my-0">{name}</h2>
        <div className="flex-1">
          {!inUse && <Tag notUsed>not in use</Tag>}
          {inUse && (
            <div className="flex flex-wrap items-center gap-(--space-xs)">
              <span>used in:</span>
              {stages}
            </div>
          )}
        </div>
        <Button onClick={handleEdit} color="sea-green">
          Edit entity
        </Button>
        <Button
          color="neon-coral"
          onClick={handleDelete}
          disabled={inUse}
          title={
            inUse
              ? `In use in ${usage.length} stage(s) — remove usages first`
              : 'Delete entity'
          }
        >
          Delete entity
        </Button>
      </div>
      <div className="mt-(--space-md)">
        <div className="flex items-center gap-(--space-md)">
          <h3 className="my-0">Variables:</h3>
          <Button
            color="sea-green"
            size="small"
            onClick={() => setShowAddVariable(true)}
          >
            Add variable
          </Button>
        </div>
        {variableArray.length > 0 && (
          <VariablesTyped
            variables={variableArray}
            entity={entity}
            type={type}
          />
        )}
      </div>
      <NewVariableWindow
        show={showAddVariable}
        entity={entity}
        type={type}
        onComplete={() => setShowAddVariable(false)}
        onCancel={() => setShowAddVariable(false)}
      />
    </Section>
  );
};

type StateProps = {
  entity: Entity;
  type: string;
};

const mapStateToProps = (state: RootState, { entity, type }: StateProps) => {
  const entityProperties = getEntityProperties(state, { entity, type });

  return entityProperties;
};

type ConnectedProps = {
  openDialog: typeof dialogActionCreators.openDialog;
  deleteType: typeof deleteTypeAsync;
};

type HandlerProps = ConnectedProps &
  EntityTypeProps & {
    onEditEntity?: (entity: string, type?: string) => void;
  };

const withEntityHandlers = compose(
  connect(null, {
    openDialog: dialogActionCreators.openDialog,
    deleteType: deleteTypeAsync,
  }),
  withHandlers<HandlerProps, object>({
    handleEdit:
      ({ entity, type, onEditEntity }: HandlerProps) =>
      () => {
        onEditEntity?.(entity, type);
      },
    handleDelete:
      ({ deleteType, openDialog, entity, type, name, inUse }: HandlerProps) =>
      () => {
        if (inUse) {
          openDialog({
            type: 'Notice',
            title: `Cannot delete ${name} ${entity}`,
            message: (
              <p>
                The {name} {entity} cannot be deleted as it is currently in use.
              </p>
            ),
          });

          return;
        }

        openDialog({
          type: 'Warning',
          title: `Delete ${name} ${entity}`,
          message: (
            <p>
              Are you sure you want to delete the {name} {entity}? This cannot
              be undone.
            </p>
          ),
          onConfirm: () => deleteType({ entity, type }),
          confirmLabel: `Delete ${name} ${entity}`,
        });
      },
  }),
);

// OwnProps - props that must be passed from outside
type OwnProps = StateProps & {
  inUse?: boolean;
  usage: UsageItem[];
  onEditEntity?: (entity: string, type?: string) => void;
};

export default compose<EntityTypeProps, OwnProps>(
  connect(mapStateToProps),
  withEntityHandlers,
)(EntityType);
