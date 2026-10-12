---
'@codaco/studio-web': minor
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
---

Participant interviews now report anonymous usability analytics: which screens
a participant reaches, how long they spend there, how they move between them,
and errors the interview hits. Never their answers, their network, or anything
that identifies them. The participant's browser sends these events only to the
Studio instance, which forwards them to Codaco's PostHog project without
building a person profile and stamps each one with the installation's id.
Nothing is collected while `STUDIO_TELEMETRY` is off, and a researcher can turn
participant analytics off for a study when creating it. Upgrading adds an
`installation_id` to the installation, through the `0002_installation_id`
migration.
