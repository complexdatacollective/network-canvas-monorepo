import { useCallback } from "react";
import { useDispatch } from "react-redux";

import Assets from "~/components/AssetBrowser/Assets";
import useExternalDataPreview from "~/components/AssetBrowser/useExternalDataPreview";
import ControlBar from "~/components/ControlBar";
import Dialog from "~/components/Dialog/Dialog";
import { Layout, Section } from "~/components/EditorLayout";
import * as Fields from "~/components/Form/Fields";
import ValidatedField from "~/components/Form/ValidatedField";
import Button from "~/lib/legacy-ui/components/Button";

import { addApiKeyAsset } from "../../../../ducks/modules/protocol/assetManifest";
import BasicForm from "../../../BasicForm";

type APIKeyBrowserProps = {
	show?: boolean;
	type?: string | null;
	selected?: string | null;
	onSelect?: (assetId: string) => void;
	onCancel?: () => void;
	close: () => void;
};

const APIKeyBrowser = ({ show = true, close, onSelect = () => {}, selected = null }: APIKeyBrowserProps) => {
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

	return (
		<Dialog
			show={show}
			onClose={close}
			className="api-key-browser-dialog"
			header={
				<div className="stage-heading stage-heading--collapsed stage-heading--shadow">
					<Layout>
						<h2>API Key Browser</h2>
					</Layout>
				</div>
			}
			footer={<ControlBar buttons={[cancelButton]} />}
		>
			<BasicForm form={formName} onSubmit={handleSubmit}>
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
						<Button key="save" type="submit" iconPosition="right" icon="arrow-right">
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
			</BasicForm>
		</Dialog>
	);
};

export default APIKeyBrowser;
