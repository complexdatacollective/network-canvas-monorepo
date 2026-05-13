import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { AnimatePresence } from "motion/react";
import { DialogBackdrop } from "~/components/NewComponents/DialogBackdrop";
import Spinner from "~/components/Spinner";

const ProtocolLoadingOverlay = ({ open }: { open: boolean }) => (
	<BaseDialog.Root open={open}>
		<AnimatePresence>
			{open && (
				<BaseDialog.Portal keepMounted className="z-(--z-dialog)">
					<DialogBackdrop />
					<div className="fixed inset-0 z-(--z-dialog) flex items-center justify-center">
						<Spinner size="xl" />
					</div>
				</BaseDialog.Portal>
			)}
		</AnimatePresence>
	</BaseDialog.Root>
);

export default ProtocolLoadingOverlay;
