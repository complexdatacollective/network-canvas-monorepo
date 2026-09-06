---
'@codaco/studio-client': minor
'@codaco/studio-server': minor
'@codaco/studio-rpc': minor
---

Add sanitized Studio error reporting through the existing Network Canvas relay, with one runtime telemetry setting that defaults on for managed and self-hosted deployments. Setting it to false prevents browser and server SDK initialization and telemetry traffic. Error reports omit personal information and protocol content, and fatal reporting preserves the server's bounded shutdown behavior.
