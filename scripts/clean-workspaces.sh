#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data/workspaces
find data/workspaces -mindepth 1 -maxdepth 1 -exec rm -rf {} +
