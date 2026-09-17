#!/bin/sh
set -eu

# Railway mounts a fresh volume as root. Initialize only its application
# directories, then run the application as the unprivileged node user.
if [ "$(id -u)" = "0" ]; then
  if [ "${DATA_DIR:-}" != "/data" ]; then
    echo "Container DATA_DIR must be /data" >&2
    exit 1
  fi
  mkdir -p /data/media /data/staging
  chown node:node /data /data/media /data/staging
  exec gosu node "$@"
fi

exec "$@"
