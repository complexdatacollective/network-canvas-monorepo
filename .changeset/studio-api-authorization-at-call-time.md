---
'@codaco/studio-api': patch
---

The protocol editor now checks a researcher's team role and study grants at
the moment of every call it serves, not only of the edits. Reading a section,
listing sections or resources, inspecting or previewing a resource, staging or
discarding one, opening a watch, answering a retried submit or create, and
giving a lock back are all refused once the researcher has been removed from
the team or lost the grant that let them reach the protocol, even when that
happened after the call opened its session. A refused watch never shows the
researcher to colleagues as present, an open watch re-reads the role and grants
when it reauthorizes, and a committed API key is read in the same transaction
as the check that allows it. A removed researcher's locks are still given back
when their connection drops. `protocols.list` likewise decides which protocols
to show from the role it reads inside its own transaction.

The audit log records a denial only when the command failed with one: a
denial marker carried by an unexpected server fault no longer writes a denied
event. A denied audit-log read that the denied-attempts window suppresses is no
longer reported to the operator as a lost denial event.

`DATABASE_URL` can now name a private certificate authority: Studio's database
client reads the certificate in `sslrootcert`, and a client certificate in
`sslcert` and `sslkey`, so a database whose certificate comes from an
institution's own authority connects without adding it to the image's trust
store or setting `NODE_EXTRA_CA_CERTS`. The server's certificate and hostname
are still verified in every TLS mode, and `sslmode=prefer` and `sslmode=allow`
are still refused at boot.
