---
'@codaco/network-exporters': patch
---

Fix a CSV/formula-injection vulnerability (OWASP) in the CSV exporter. Exported
cell values include untrusted, participant-entered interview data; a value
beginning with a spreadsheet formula trigger (`=`, `+`, `-`, `@`, tab, or CR)
could be evaluated as a formula when the CSV is opened in Excel / Google Sheets /
LibreOffice (data exfiltration via `HYPERLINK`/`WEBSERVICE`, or command
execution via DDE). `sanitizeCellValue` now prefixes such string values with a
single quote so spreadsheets treat them as literal text. This covers all CSV
output (attributeList, edgeList, egoList, adjacencyMatrix). Existing
quote-wrapping/escaping and non-string passthrough behavior are preserved.
