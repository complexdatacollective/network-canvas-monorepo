# Registry failed magic-link delivery cleanup

The Better Auth magic-link plugin writes a verification row before calling the
mail transport. If delivery failed, Studio's Registry returned a redacted 503
but retained the token indefinitely. The new callback deletes exactly the
failed token's hashed identifier before returning the same redacted failure.
Successfully delivered tokens for the same email remain usable.

The sign-in boundary accepts only email and bounded callback URLs. It rejects
arbitrary name/metadata fields before invoking Better Auth. Token hashing keeps
the existing SHA-256 UTF-8, unpadded base64url representation, now shared with
the deletion query through the plugin's explicit custom-hasher option.

Validation: the new PostgreSQL assertions failed against the original code
(five failures, 36 passes), including three retained failed tokens and accepted
unsupported request fields. With the correction all 41 authentication tests
pass; successful delivery and one-use consumption remain covered. Registry
typecheck and focused lint pass. No schema or migration changes are required.

This corrects the unpublished Registry implementation within PR #1745; its
existing Registry changeset remains applicable. It does not provision or send
production mail.
