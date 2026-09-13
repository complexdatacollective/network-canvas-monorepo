# syntax=docker/dockerfile:1
# Qualification-only kernel observer. Deriving from the exact candidate keeps
# its Node runtime identical while leaving conntrack out of the production image.
ARG STUDIO_CANDIDATE_IMAGE
FROM ${STUDIO_CANDIDATE_IMAGE}
USER root
RUN apt-get update \
  && apt-get install --yes --no-install-recommends conntrack \
  && rm -rf /var/lib/apt/lists/*
