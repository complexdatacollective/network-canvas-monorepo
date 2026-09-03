---
'@codaco/studio-client': minor
'@codaco/studio-server': minor
'@codaco/studio-rpc': minor
---

Put real numbers on the study sidebar's countable destinations, so a researcher
can see how much is in a study without opening each screen to find out.
Versions, Participants, Waves and Sessions each carry the count the app-shell
design gives them, read from the study's own rows through a new
`studies.counts` procedure: one query, under the team boundary, so the four
numbers are always describing the same study at the same moment.

A count is a claim, and an unchecked one is worse than none. Until the answer
arrives — and if it never does, because the read failed or no team is known
yet — the rows render exactly as they did before, with no number at all. A
study with nothing in it is left unnumbered for the same reason: "Participants"
reads better than "Participants 0", and neither is ever invented on the
client's behalf.

API tokens in the account area gets no count. Tokens are owned by a team and
answerable to a custodian, so "how many are mine" is not a question the data
model can answer, and a number that quietly meant "this team's tokens" would be
the wrong answer rather than a missing one.
