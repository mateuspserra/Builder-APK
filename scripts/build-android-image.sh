#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
docker build -t apk-builder-android:latest docker/android-builder
