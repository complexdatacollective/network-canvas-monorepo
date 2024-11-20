"use client";

import { Download } from "lucide-react";
import Papa from "papaparse";
import type { Event } from "~/app/_actions/actions";
import { Button } from "~/components/ui/button";

type ExportButtonProps = {
	data: Event[];
	filename: string;
};

export const ExportButton: React.FC<ExportButtonProps> = ({ data, filename }) => {
	const handleExportCsv = () => {
		const csvData = Papa.unparse(data);

		const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });

		const link = document.createElement("a");
		if (link.download !== undefined) {
			const url = URL.createObjectURL(blob);
			link.setAttribute("href", url);
			link.setAttribute("download", filename);
			link.style.visibility = "hidden";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
	};

	return (
		<Button onClick={handleExportCsv} size="sm">
			<Download className="mr-2 h-4 w-4" /> Download Data
		</Button>
	);
};
