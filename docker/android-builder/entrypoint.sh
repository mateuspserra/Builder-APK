#!/usr/bin/env bash
set -euo pipefail

if [ -f /workspace/gradlew ]; then
  chmod +x /workspace/gradlew
fi

if [ -f /workspace/android/gradlew ]; then
  chmod +x /workspace/android/gradlew
fi

exec "$@"
