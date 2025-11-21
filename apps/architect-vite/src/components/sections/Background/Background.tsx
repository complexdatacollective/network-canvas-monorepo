import { PureComponent } from "react";
import { compose } from "recompose";
import { Field } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import { BooleanField, Number as NumberField, Toggle } from "~/components/Form/Fields";
import IssueAnchor from "~/components/IssueAnchor";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import DetachedField from "../../DetachedField";
import Image from "../../Form/Fields/Image";
import ValidatedField from "../../Form/ValidatedField";
import withBackgroundChangeHandler from "./withBackgroundChangeHandler";

type BackgroundProps = StageEditorSectionProps & {
	handleChooseBackgroundType: (value: boolean) => void;
	useImage: boolean;
};

class Background extends PureComponent<BackgroundProps> {
	render() {
		const { handleChooseBackgroundType, useImage } = this.props;

		return (
			<Section
				title="Background"
				summary={
					<p>
						This section determines the graphical background for this prompt. You can choose between a conventional
						series of concentric circles, or provide your own background image.
					</p>
				}
			>
				<Row>
					<DetachedField
						component={BooleanField as React.ComponentType<Record<string, unknown>>}
						value={useImage}
						options={[
							{
								value: false,
								label: () => (
									<div>
										<h4>Concentric Circles</h4>
										<p>Use the conventional concentric circles sociogram background.</p>
									</div>
								),
							},
							{
								value: true,
								label: () => (
									<div>
										<h4>Image</h4>
										<p>Use a custom image of your choosing as the background.</p>
									</div>
								),
							},
						]}
						onChange={(_event: unknown, nextValue: unknown, _currentValue: unknown, _name: string | null) =>
							handleChooseBackgroundType(nextValue as boolean)
						}
						label="Choose a background type"
						noReset
					/>
				</Row>
				{!useImage && (
					<>
						<Row>
							<IssueAnchor fieldName="background.concentricCircles" description="Background > Concentric Circles" />
							<ValidatedField
								name="background.concentricCircles"
								component={NumberField}
								normalize={(value) => Number.parseInt(value, 10) || value}
								validation={{ required: true, positiveNumber: true }}
								componentProps={{
									label: "Number of concentric circles to use:",
									type: "number",
								}}
							/>
						</Row>
						<Row>
							<Field
								name="background.skewedTowardCenter"
								component={Toggle}
								label="Skew the size of the circles so that the middle is proportionally larger."
							/>
						</Row>
					</>
				)}
				{useImage && (
					<Row>
						<IssueAnchor fieldName="background.image" description="Background > Image" />
						<ValidatedField
							name="background.image"
							component={Image as React.ComponentType<Record<string, unknown>>}
							validation={{ required: true }}
							componentProps={{
								label: "Background image",
							}}
						/>
					</Row>
				)}
			</Section>
		);
	}
}

export default compose(withBackgroundChangeHandler)(
	Background as unknown as React.ComponentType<unknown>,
) as unknown as React.ComponentType<StageEditorSectionProps>;
