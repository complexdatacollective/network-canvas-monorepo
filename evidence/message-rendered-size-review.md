# Rendered message queue progress

Master review found two remaining poison-message cases: placeholder expansion beyond the rendered body limit, and UTF-8 JSON whose AES-GCM envelope exceeds the persisted 16 KiB limit. The scheduled producer now checks the shared rendered-message schema before enqueueing and durably blocks invalid occurrences, allowing later work to progress. The same schema enforces the byte limit for all sealing and read callers.

The real PostgreSQL regression failed on the predecessor's unhandled Zod error. Removing only the encrypted-byte guard then failed at the actual message_deliveries_hash_check. Restoring the exact source passed; all 15 message delivery tests pass. The regression includes valid 5000-character CJK mail after the invalid cases, proving valid non-ASCII payloads still enqueue. Server typecheck, focused lint and Knip passed. Numbered migrations are unchanged by this follow-up.

The previously rejected webhook-parent integration remains pending explicit approval. This checkpoint does not claim that merge or final integrated review is complete.
