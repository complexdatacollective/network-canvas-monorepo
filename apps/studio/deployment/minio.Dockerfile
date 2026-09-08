# syntax=docker/dockerfile:1
# Upstream's last official container predates its October2025 security fix.
# Build the immutable reviewed release source instead of using that stale tag.
FROM --platform=$BUILDPLATFORM golang:1.26-alpine@sha256:ce864e7223ac17b1775e6fd0b4c0db580c2eb50e7953a427916379e4b92a1628 AS build
ARG TARGETARCH
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOMAXPROCS=4
ADD --checksum=sha256:45521908307306e925c98d629e1c17d78c8b72b6ee242b1bfb1409f7d8ee5841 https://codeload.github.com/minio/minio/tar.gz/9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a /source.tar.gz
RUN mkdir /source && tar -xzf /source.tar.gz --strip-components=1 -C /source
WORKDIR /source
RUN --mount=type=cache,target=/go/pkg/mod go mod download
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
  GOARCH=$TARGETARCH go build -p=4 -trimpath -buildvcs=false \
    -ldflags='-s -w -X github.com/minio/minio/cmd.Version=2025-10-15T17:29:55Z -X github.com/minio/minio/cmd.CopyrightYear=2025 -X github.com/minio/minio/cmd.ReleaseTag=RELEASE.2025-10-15T17-29-55Z -X github.com/minio/minio/cmd.CommitID=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a -X github.com/minio/minio/cmd.ShortCommitID=9e49d5e7a648' \
    -o /minio .

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
RUN apk add --no-cache ca-certificates && adduser -D -u 1000 minio && mkdir /data && chown minio:minio /data
COPY --from=build /minio /usr/local/bin/minio
COPY --from=build /source/LICENSE /source/CREDITS /usr/share/licenses/minio/
# Preserve complete corresponding upstream source with the redistributed binary.
COPY --from=build /source.tar.gz /usr/share/minio/source.tar.gz
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
  org.opencontainers.image.revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a" \
  org.opencontainers.image.version="RELEASE.2025-10-15T17-29-55Z" \
  org.opencontainers.image.licenses="AGPL-3.0-or-later"
USER minio
EXPOSE 9000
ENTRYPOINT ["minio"]
CMD ["server", "/data"]
