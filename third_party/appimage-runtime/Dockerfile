ARG RUNTIME_BASE
FROM ${RUNTIME_BASE}

# Match the pinned runtime's upstream Dockerfile, with source-capture tools.
RUN apk add --no-cache \
    bash alpine-sdk util-linux strace file autoconf automake libtool xz \
    eudev-dev gettext-dev linux-headers meson \
    zstd-dev zstd-static zlib-dev zlib-static clang musl-dev mimalloc-dev \
    python3 curl ca-certificates

COPY build-runtime.sh collect-sources.py test-apprun.sh /recipe/
ENTRYPOINT ["bash", "/recipe/build-runtime.sh"]
