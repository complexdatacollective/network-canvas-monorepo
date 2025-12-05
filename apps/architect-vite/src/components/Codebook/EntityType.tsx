import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { Link } from "wouter";
import { actionCreators as dialogActionCreators } from "~/ducks/modules/dialogs";
import { deleteTypeAsync } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/store";
import { Button } from "~/lib/legacy-ui/components";
import EntityIcon from "./EntityIcon";
import { getEntityProperties } from "./helpers";
import Tag from "./Tag";
import Variables from "./Variables";

type Entity = "node" | "edge" | "ego";

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
	usage: UsageItem[];
	inUse?: boolean;
	handleDelete?: () => void;
	handleEdit?: () => void;
	variables?: Record<string, Variable>;
};

const EntityType = ({
	name,
	color,
	inUse = true,
	usage,
	entity,
	type,
	variables = {},
	handleEdit = () => {},
	handleDelete = () => {},
}: EntityTypeProps) => {
	const variableArray = Object.values(variables);
	const VariablesTyped = Variables as unknown as React.ComponentType<VariablesComponentProps>;

	const stages = usage.map(({ id, label }) =>
		id ? (
			<Link
				href={`/protocol/stage/${id}`}
				key={id}
				className="underline decoration-[color:var(--color-action)] underline-offset-4 px-1"
			>
				{label}
			</Link>
		) : (
			<span key={`validation-${label}`} className="px-1">
				{label}
			</span>
		),
	);

	return (
		<div className="codebook__entity">
			<div className="codebook__entity-detail">
				<div className="codebook__entity-icon">
					<EntityIcon color={color} entity={entity} />
				</div>
				<div className="codebook__entity-name">
					<h2>{name}</h2>
				</div>
				<div className="codebook__entity-meta">
					{!inUse && <Tag>not in use</Tag>}
					{inUse && (
						<>
							<em>used in:</em> {stages}
						</>
					)}
				</div>
				<div className="codebook__entity-control">
					<Button onClick={handleEdit} color="sea-green">
						Edit entity
					</Button>
					<Button color="neon-coral" onClick={handleDelete}>
						Delete entity
					</Button>
				</div>
			</div>
			{variableArray.length > 0 && (
				<div className="codebook__entity-variables">
					<h3>Variables:</h3>
					<VariablesTyped variables={variableArray} entity={entity} type={type} />
				</div>
			)}
		</div>
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
						type: "Notice",
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
					type: "Warning",
					title: `Delete ${name} ${entity}`,
					message: (
						<p>
							Are you sure you want to delete the {name} {entity}? This cannot be undone.
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

export default compose<EntityTypeProps, OwnProps>(connect(mapStateToProps), withEntityHandlers)(EntityType);
