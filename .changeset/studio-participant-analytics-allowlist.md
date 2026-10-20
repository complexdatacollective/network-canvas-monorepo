---
'@codaco/studio-api': patch
'@codaco/studio-contract': patch
'@codaco/studio-web': patch
---

The api now forwards a participant page's usability events to PostHog only when every event in the batch is in the interview's analytics catalogue and every property decodes to its declared type, with no property the catalogue does not declare. A batch holding any other event, an extra property, free text where a code or number is expected, or a timestamp that is not an ISO 8601 UTC instant is refused whole and nothing in it is forwarded, as the participant log route refuses a batch.

Of what decodes, the api forwards the event's catalogued codes, numbers and flags. It replaces each entity id with an id derived on the server from the installation, the session and the page's id. It stamps each event with the server's clock, keeping from the page's timestamps only the order and spacing of the batch's events, up to ten minutes apart. It reports an exception's type only when it is a standard JavaScript or DOM error name, and `Error` otherwise. It withholds the interview package version, the protocol digest, a stage crash's component stack, and the identifiers the page reports about itself, which the server sets. The participant contract now declares the `$exception_list` shape and the timestamp a participant page sends.
