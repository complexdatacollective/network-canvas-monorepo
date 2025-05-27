import { AnimatePresence, motion } from "motion/react";
import PropTypes from "prop-types";
import { useCallback } from "react";
import * as Fields from "~/lib/legacy-ui/components/Fields";

import { createPortal } from "react-dom";
import Assets from "~/components/AssetBrowser/Assets";
import useExternalDataPreview from "~/components/AssetBrowser/useExternalDataPreview";
import ControlBar from "~/components/ControlBar";
import { Layout, Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import Screen from "~/components/Screen/Screen";
import { screenVariants } from "~/components/Screens/Screens";
import Button from "~/lib/legacy-ui/components/Button";

import { useDispatch } from "react-redux";

import { addApiKeyAsset } from "../../../../ducks/modules/protocol/assetManifest";
import BasicForm from "../../../BasicForm";

const APIKeyBrowser = ({ show, close, onSelect, selected }) => {
	const formName = "create-api-key";
	const dispatch = useDispatch();
	const [preview, handleShowPreview] = useExternalDataPreview();

	const handleSelectAsset = useCallback(
		(assetId) => {
			onSelect(assetId);
			close();
		},
		[onSelect],
	);

	const handleSubmit = useCallback(
		(formValues) => {
			dispatch(addApiKeyAsset(formValues.keyName, formValues.keyValue));
		},
		[close],
	);

	const cancelButton = (
		<Button color="platinum" onClick={close} key="cancel">
			Cancel
		</Button>
	);

	if (!show) {
		return null;
	}

	return createPortal(
		<AnimatePresence>
			{show && (
				<motion.div
					variants={screenVariants}
					initial="hidden"
					animate="visible"
					exit="hidden"
					className="screens-container"
				>
					<BasicForm form={formName} onSubmit={handleSubmit}>
						<Screen
							header={
								<div className="stage-heading stage-heading--collapsed stage-heading--shadow">
									<Layout>
										<h2>API Key Browser</h2>
									</Layout>
								</div>
							}
							footer={<ControlBar buttons={[cancelButton]} />}
						>
							<Layout>
								<Section title="Create New API Key">
									<div data-name="API Key Name" />
									<ValidatedField
										component={Fields.Text}
										label="API Key Name"
										type="text"
										placeholder="Name this key"
										name="keyName"
										validation={{ required: true }}
									/>
									<div data-name="API Key Value" />
									<ValidatedField
										component={Fields.Text}
										label="API Key"
										type="text"
										placeholder="Enter an API Key..."
										name="keyValue"
										validation={{ required: true }}
									/>
									<Button key="save" type="submit" iconPosition="right" icon="arrow-right" size="small">
										Create Key
									</Button>
								</Section>
								<Section title="Resource Library">
									<Assets
										onSelect={handleSelectAsset}
										selected={selected}
										type="apikey"
										disableDelete
										onPreview={handleShowPreview}
									/>
								</Section>
								{preview}
							</Layout>
						</Screen>
					</BasicForm>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
};

APIKeyBrowser.propTypes = {
	show: PropTypes.bool,
	type: PropTypes.string,
	selected: PropTypes.string,
	onSelect: PropTypes.func,
	onCancel: PropTypes.func,
};

APIKeyBrowser.defaultProps = {
	show: true,
	type: null,
	selected: null,
	onSelect: () => {},
	onCancel: () => {},
};

export default APIKeyBrowser;
