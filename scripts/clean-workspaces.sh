#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

WORKSPACES_DIR="${WORKSPACES_DIR:-data/workspaces}"
KEEP_DAYS="${WORKSPACE_KEEP_DAYS:-2}"
KEEP_RECENT_COUNT="${WORKSPACE_KEEP_RECENT_COUNT:-1}"
MAX_COUNT="${WORKSPACE_MAX_COUNT:-$KEEP_RECENT_COUNT}"
MAX_TOTAL_MB="${WORKSPACE_MAX_TOTAL_MB:-4096}"
DRY_RUN="${DRY_RUN:-false}"

mkdir -p "$WORKSPACES_DIR"

if [[ ! "$KEEP_DAYS" =~ ^[0-9]+$ ]]; then
  echo "WORKSPACE_KEEP_DAYS must be a non-negative integer" >&2
  exit 2
fi

if [[ ! "$KEEP_RECENT_COUNT" =~ ^[0-9]+$ ]]; then
  echo "WORKSPACE_KEEP_RECENT_COUNT must be a non-negative integer" >&2
  exit 2
fi

if [[ ! "$MAX_COUNT" =~ ^[0-9]+$ ]]; then
  echo "WORKSPACE_MAX_COUNT must be a non-negative integer" >&2
  exit 2
fi

if [[ ! "$MAX_TOTAL_MB" =~ ^[0-9]+$ ]]; then
  echo "WORKSPACE_MAX_TOTAL_MB must be a non-negative integer" >&2
  exit 2
fi

workspace_root="$(realpath -m "$WORKSPACES_DIR")"
repo_root="$(pwd)"

case "$workspace_root" in
  "$repo_root"/data/workspaces|"$repo_root"/data/workspaces/*) ;;
  *)
    echo "Refusing to clean path outside repository data/workspaces: $workspace_root" >&2
    exit 2
    ;;
esac

mapfile -d '' workspace_dirs < <(
  find "$workspace_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\0' |
    sort -z -nr |
    awk -v RS='\0' -v ORS='\0' '{ sub(/^[^ ]+ /, ""); print }'
)

dir_size_bytes() {
  du -sb "$1" 2>/dev/null | awk '{print $1}'
}

now="$(date +%s)"
max_total_bytes=$((MAX_TOTAL_MB * 1024 * 1024))
total_bytes=0

for directory in "${workspace_dirs[@]}"; do
  size="$(dir_size_bytes "$directory")"
  total_bytes=$((total_bytes + size))
done

removed=0
kept=0
total=${#workspace_dirs[@]}

echo "workspace retention: dir=$workspace_root total=$total keep_recent=$KEEP_RECENT_COUNT max_count=$MAX_COUNT keep_days=$KEEP_DAYS max_total_mb=$MAX_TOTAL_MB current_total_mb=$((total_bytes / 1024 / 1024)) dry_run=$DRY_RUN"

for index in "${!workspace_dirs[@]}"; do
  directory="${workspace_dirs[$index]}"
  modified="$(stat -c '%Y' "$directory" 2>/dev/null || echo "$now")"
  age_days=$(((now - modified) / 86400))
  size="$(dir_size_bytes "$directory")"
  reason=""

  if [ "$index" -lt "$KEEP_RECENT_COUNT" ]; then
    echo "keep recent: $directory"
    kept=$((kept + 1))
    continue
  fi

  if [ "$MAX_COUNT" -gt 0 ] && [ "$index" -ge "$MAX_COUNT" ]; then
    reason="count>${MAX_COUNT}"
  elif [ "$age_days" -gt "$KEEP_DAYS" ]; then
    reason="age>${KEEP_DAYS}d"
  elif [ "$MAX_TOTAL_MB" -gt 0 ] && [ "$total_bytes" -gt "$max_total_bytes" ]; then
    reason="size>${MAX_TOTAL_MB}MB"
  fi

  if [ -z "$reason" ]; then
    echo "keep: $directory age=${age_days}d size_mb=$((size / 1024 / 1024))"
    kept=$((kept + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "dry-run remove reason=$reason age=${age_days}d size_mb=$((size / 1024 / 1024)) path=$directory"
  else
    echo "remove reason=$reason age=${age_days}d size_mb=$((size / 1024 / 1024)) path=$directory"
    rm -rf --one-file-system "$directory"
  fi

  total_bytes=$((total_bytes - size))
  removed=$((removed + 1))
done

echo "workspace retention finished: removed=$removed kept=$kept total=$total final_total_mb=$((total_bytes / 1024 / 1024))"
