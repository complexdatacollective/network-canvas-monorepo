import { useCallback } from "react";

import Assets from "~/components/AssetBrowser/Assets";
import useExternalDataPreview from "~/components/AssetBrowser/useExternalDataPreview";
import { Layout, Section } from "~/components/EditorLayout";
import { Text } from "~/components/Form/Fields";
import ValidatedField from "~/components/Form/ValidatedField";
import Dialog from "~/components/NewComponents/Dialog";
import { useAppDispatch } from "~/ducks/hooks";
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
	const dispatch = useAppDispatch();
	const [preview, handleShowPreview] = useExternalDataPreview();

	const handleSelectAsset = useCallback(
		(assetId: string) => {
			onSelect(assetId);
			close();
		},
		[onSelect, close],
	);

	const handleSubmit = useCallback(
		(formValues: Record<string, unknown>) => {
			const { keyName, keyValue } = formValues as {
				keyName: string;
				keyValue: string;
			};
			dispatch(addApiKeyAsset(keyName, keyValue));
		},
		[dispatch],
	);

	return (
		<Dialog
			open={show}
			onOpenChange={(open) => !open && close()}
			header={<h2 className="m-0">API Key Browser</h2>}
			footer={
				<Button color="platinum" onClick={close}>
					Cancel
				</Button>
			}
		>
			<BasicForm form={formName} onSubmit={handleSubmit}>
				<Layout>
					<Section title="Create New API Key" layout="vertical">
						<div data-name="API Key Name" />
						<ValidatedField
							component={Text}
							name="keyName"
							validation={{ required: true }}
							componentProps={{
								label: "API Key Name",
								type: "text",
								placeholder: "Name this key",
							}}
						/>
						<div data-name="API Key Value" />
						<ValidatedField
							component={Text}
							name="keyValue"
							validation={{ required: true }}
							componentProps={{
								label: "API Key",
								type: "text",
								placeholder: "Enter an API Key...",
							}}
						/>
						<Button key="save" type="submit" iconPosition="right" icon="arrow-right">
							Create Key
						</Button>
					</Section>
					<Section title="Resource Library" layout="vertical">
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
