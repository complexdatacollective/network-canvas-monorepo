# Studio release tools

Studio distribution jobs install their release tools with
`node scripts/studio-release-tools.mjs <private-parent-directory>`. The command
creates a new mode `0700` directory and prints its path. The caller adds that
directory to `PATH` for the release job and removes it when the job finishes.

The committed `scripts/studio-release-tools.json` allowlist pins Ubuntu x64 and
macOS arm64 artifacts from versioned official GitHub releases:

- Cosign 3.1.3 from `sigstore/cosign`
- Syft 1.51.1 from `anchore/syft`
- Crane 0.22.1 from `google/go-containerregistry`

For each tool, the bootstrap downloads the versioned official checksum file,
matches its committed SHA-256, requires the exact asset entry, then matches the
downloaded asset and extracted executable SHA-256 values. Tar archives must have
the exact recorded regular-file inventory and executable modes. Only the named
tool is extracted. The installed executable must report the pinned version and
platform before the bootstrap returns it.

The workflow must use the returned absolute paths for image preparation and
signing. It must keep its existing non-cancelling distribution lock; installing
these tools does not reserve image tags or authenticate a release candidate.
