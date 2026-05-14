import Dialog from "@codaco/fresco-ui/dialogs/Dialog";
import Spinner from "@codaco/fresco-ui/Spinner";

type ProgressDialogProps = {
	open: boolean;
	title: string;
	message?: string;
	progress?: { current: number; total: number };
};

export default function ProgressDialog({ open, title, message, progress }: ProgressDialogProps) {
	const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : null;
	return (
		<Dialog title={title} open={open}>
			<div className="flex items-center gap-4">
				<Spinner />
				<div className="flex-1">
					{message ? <p className="text-sm">{message}</p> : null}
					{progress ? (
						<div className="mt-2">
							<div className="h-2 w-full overflow-hidden rounded-full bg-border">
								<div
									className="h-full bg-primary transition-[width]"
									style={{ width: `${pct ?? 0}%` }}
									aria-valuenow={pct ?? 0}
									aria-valuemin={0}
									aria-valuemax={100}
									role="progressbar"
								/>
							</div>
							<p className="mt-1 text-xs text-muted-foreground">
								{progress.current} / {progress.total}
							</p>
						</div>
					) : null}
				</div>
			</div>
		</Dialog>
	);
}
