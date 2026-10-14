---
'@codaco/studio-api': patch
'@codaco/studio-contract': patch
'@codaco/studio-web': patch
---

The api now forwards a participant page's usability events to PostHog only when every event in the batch is in the interview's analytics catalogue and every property decodes to its declared type, with no property the catalogue does not declare. A batch holding any other event, an extra property, or free text where a code or number is expected is refused whole and nothing in it is forwarded, as the participant log route refuses a batch. Of what decodes, the api forwards the event's catalogued properties and the interview package version, and withholds the protocol digest, a stage crash's component stack, and the identifiers the page reports about itself, which the server sets. The participant contract now declares the `$exception_list` shape a participant page sends with an exception.
