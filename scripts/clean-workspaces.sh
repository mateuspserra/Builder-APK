#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

WORKSPACES_DIR="${WORKSPACES_DIR:-data/workspaces}"
KEEP_DAYS="${WORKSPACE_KEEP_DAYS:-2}"
KEEP_RECENT_COUNT="${WORKSPACE_KEEP_RECENT_COUNT:-1}"
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

workspace_root="$(realpath -m "$WORKSPACES_DIR")"
repo_root="$(pwd)"

case "$workspace_root" in
  "$repo_root"/data/workspaces|"$repo_root"/data/workspaces/*) ;;
  *)
    echo "Refusing to clean path outside repository data/workspaces: $workspace_root" >&2
    exit 2
    ;;
esac

mapfile -d '' recent_dirs < <(
  find "$workspace_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\0' |
    sort -z -nr |
    awk -v RS='\0' -v ORS='\0' -v limit="$KEEP_RECENT_COUNT" 'NR <= limit { sub(/^[^ ]+ /, ""); print }'
)

should_keep_recent() {
  local candidate="$1"
  local recent
  for recent in "${recent_dirs[@]}"; do
    [[ "$candidate" == "$recent" ]] && return 0
  done
  return 1
}

removed=0
kept=0

while IFS= read -r -d '' directory; do
  if should_keep_recent "$directory"; then
    echo "keep recent: $directory"
    kept=$((kept + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "dry-run remove: $directory"
  else
    echo "remove: $directory"
    rm -rf --one-file-system "$directory"
  fi
  removed=$((removed + 1))
done < <(find "$workspace_root" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -print0)

echo "workspace retention finished: removed=$removed kept_recent=$kept keep_days=$KEEP_DAYS"
