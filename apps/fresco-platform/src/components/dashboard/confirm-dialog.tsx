"use client";

import { Button, cn, Input, Label } from "@codaco/ui";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

type ConfirmDialogProps = {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	description: string;
	confirmText?: string;
	requiresTypedConfirmation?: boolean;
	confirmationWord?: string;
	variant?: "danger" | "warning";
	isLoading?: boolean;
};

export function ConfirmDialog({
	isOpen,
	onClose,
	onConfirm,
	title,
	description,
	confirmText = "Confirm",
	requiresTypedConfirmation = false,
	confirmationWord = "DELETE",
	variant = "danger",
	isLoading = false,
}: ConfirmDialogProps) {
	const [inputValue, setInputValue] = useState("");

	if (!isOpen) return null;

	const isConfirmDisabled = requiresTypedConfirmation ? inputValue !== confirmationWord : false;

	const handleConfirm = () => {
		if (!isConfirmDisabled) {
			onConfirm();
			setInputValue("");
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<div className="fixed inset-0 bg-black/50" onClick={onClose} />

			<div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
				<div className="flex items-start gap-4">
					<div className={cn("rounded-full p-2", variant === "danger" ? "bg-red-100" : "bg-yellow-100")}>
						<AlertTriangle className={cn("h-6 w-6", variant === "danger" ? "text-red-600" : "text-yellow-600")} />
					</div>

					<div className="flex-1">
						<h3 className="text-lg font-semibold text-gray-900">{title}</h3>
						<p className="mt-2 text-sm text-gray-600">{description}</p>

						{requiresTypedConfirmation && (
							<div className="mt-4">
								<Label htmlFor="confirm-input" className="text-sm font-medium">
									Type <span className="font-mono font-bold">{confirmationWord}</span> to confirm
								</Label>
								<Input
									id="confirm-input"
									type="text"
									value={inputValue}
									onChange={(e) => setInputValue(e.target.value)}
									placeholder={confirmationWord}
									className="mt-2"
									autoComplete="off"
								/>
							</div>
						)}
					</div>
				</div>

				<div className="mt-6 flex justify-end gap-3">
					<Button variant="outline" onClick={onClose} disabled={isLoading}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={handleConfirm} disabled={isConfirmDisabled || isLoading}>
						{isLoading ? "Processing..." : confirmText}
					</Button>
				</div>
			</div>
		</div>
	);
}
