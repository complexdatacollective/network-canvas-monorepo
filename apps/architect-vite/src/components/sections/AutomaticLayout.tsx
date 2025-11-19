import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import * as Fields from "~/components/Form/Fields";
import DetachedField from "../DetachedField";
import IssueAnchor from "../IssueAnchor";

const FORM_PROPERTY = "behaviours.automaticLayout.enabled";

type AutomaticLayoutProps = {
	form: string;
};

type RootState = Record<string, unknown>;

const AutomaticLayout = ({ form }: AutomaticLayoutProps) => {
	const dispatch = useDispatch();
	const formSelector = useMemo(() => formValueSelector(form), [form]);
	const formValue = useSelector((state: RootState) => !!formSelector(state, FORM_PROPERTY));

	const [useAutomaticLayout, setUseAutomaticLayout] = useState(formValue);

	const handleChooseLayoutMode = () => {
		if (useAutomaticLayout) {
			dispatch(change("edit-stage", FORM_PROPERTY, false));
			setUseAutomaticLayout(false);
			return;
		}

		dispatch(change("edit-stage", FORM_PROPERTY, true));
		setUseAutomaticLayout(true);
	};

	return (
		<Section
			title="Layout Mode"
			summary={
				<p>
					Interviewer offers two modes for positioning nodes on the sociogram: &quot;Manual&quot;, and
					&quot;Automatic&quot;.
				</p>
			}
		>
			<Row>
				<IssueAnchor fieldName="behaviours.automaticLayout.enabled" description="Layout mode" />
				<p>
					<strong>Automatic mode</strong> positions nodes when the stage is first shown by simulating physical forces
					such as attraction and repulsion. This simulation can be paused and resumed within the interview. When paused,
					the position of nodes can be adjusted manually.
				</p>
				<p>
					<strong>Manual mode</strong> first places all nodes into a &quot;bucket&quot; at the bottom of the screen,
					from which the participant can drag nodes to their desired position.
				</p>
			</Row>
			<Row>
				<DetachedField
					component={Fields.Boolean}
					onChange={handleChooseLayoutMode}
					value={useAutomaticLayout}
					validation={{ required: true }}
					options={[
						{
							value: false,
							label: () => (
								<div>
									<h4>Manual mode</h4>
									<p>Participants must position their alters manually.</p>
								</div>
							),
						},
						{
							value: true,
							label: () => (
								<div>
									<h4>Automatic mode</h4>
									<p>A force-directed layout positions nodes automatically.</p>
								</div>
							),
						},
					]}
					noReset
				/>
			</Row>
		</Section>
	);
};

export default AutomaticLayout;
