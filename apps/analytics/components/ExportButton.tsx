"use client";
import type { Event, Error } from "~/db/schema";
import Papa from "papaparse";
import { Button } from "~/components/ui/button";
import { Download } from "lucide-react";

interface ExportButtonProps {
  data: (Event | Error)[];
  filename: string;
}

const ExportButton: React.FC<ExportButtonProps> = ({ data, filename }) => {
  const handleExportCSV = () => {
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
    <Button onClick={handleExportCSV} size="sm">
      <Download className="mr-2 h-4 w-4" /> Download Data
    </Button>
  );
};

export default ExportButton;
