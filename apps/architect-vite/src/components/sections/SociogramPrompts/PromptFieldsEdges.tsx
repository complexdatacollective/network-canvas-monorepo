/* eslint-disable react/jsx-props-no-spreading */
import { union } from "es-toolkit/compat";
import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, Field, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import * as Fields from "~/lib/legacy-ui/components/Fields";
import Tip from "../../Tip";
import { getEdgeFilters, getEdgesForSubject } from "./selectors";
import getEdgeFilteringWarning from "./utils";

type DisplayEdgesProps = {
	form: string;
	entity: string;
	type: string;
};

const DisplayEdges = ({ form, entity, type }: DisplayEdgesProps) => {
	const dispatch = useDispatch();
	
	// Fix 1: Use the already memoized selector directly
	const edgesForSubject = useSelector(getEdgesForSubject);
	
	// Fix 2: Memoize form selectors
	const formSelector = useMemo(() => formValueSelector(form), [form]);
	const createEdge = useSelector((state) => formSelector(state, "edges.create"));
	const displayEdges = useSelector((state) => formSelector(state, "edges.display"));

	// Fix 3: Memoize the mapped array
	const displayEdgesOptions = useMemo(() => 
		edgesForSubject.map((edge) => {
			if (edge.value !== createEdge) {
				return edge;
			}
			return {
				...edge,
				disabled: true,
			};
		}), [edgesForSubject, createEdge]
	);

	const hasDisabledEdgeOption = displayEdgesOptions.some((option) => option.disabled);

	useEffect(() => {
		const displayEdgesWithCreatedEdge = union(displayEdges, [createEdge]);
		dispatch(change(form, "edges.display", displayEdgesWithCreatedEdge));
	}, [createEdge]);

	const edgeFilters = useSelector((state) => getEdgeFilters(state));
	const shouldShowNetworkFilterWarning = getEdgeFilteringWarning(edgeFilters, displayEdges);

	return (
		<>
			<Section
				title="Display Edges"
				summary={
					<p>
						You can display one or more edge types on this prompt. Where two nodes are connected by multiple edge types,
						only one of those edge types will be displayed.
					</p>
				}
				toggleable
				startExpanded={!!displayEdges}
				disabled={edgesForSubject.length === 0}
				handleToggleChange={(value: boolean) => {
					// Disallow closing when there is a disabled edge option
					if (!value && hasDisabledEdgeOption) {
						return false;
					}

					if (value) {
						return true;
					}

					// Reset edge creation
					dispatch(change(form, "edges.display", null));
					return true;
				}}
			>
				<Row>
					{shouldShowNetworkFilterWarning && (
						<Tip type="warning">
							<p>
								Stage level network filtering is enabled, but one or more of the edge types you have configured to
								display on this prompt are not currently included in the filter. This means that these edges may not be
								displayed. Either remove the stage-level network filtering, or add these edge types to the filter to
								resolve this issue.
							</p>
						</Tip>
					)}
					{hasDisabledEdgeOption && (
						<Tip>
							<p>
								The edge type being created must always be displayed. This edge type is shown in italics below, and
								cannot be deselected.
							</p>
						</Tip>
					)}
					<Field
						name="edges.display"
						component={Fields.CheckboxGroup}
						options={displayEdgesOptions}
						label="Display edges of the following type(s)"
					/>
				</Row>
			</Section>
		</>
	);
};

export default DisplayEdges;
