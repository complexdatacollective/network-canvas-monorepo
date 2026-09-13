---
'@codaco/studio-server': minor
'@codaco/studio-client': patch
---

Run Studio as a combined service or separate web and worker processes. Web startup refuses a second replica, and shutdown stops new delivery claims while active requests and WebSockets drain. Runtime database roles can read schema readiness without changing migration evidence. Completed self-hosted setup now permanently returns not found and sends the new owner to sign-in.
