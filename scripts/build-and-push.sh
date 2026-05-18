#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/build-and-push.sh <dockerhub-repo[:tag]> [tag]

Examples:
  scripts/build-and-push.sh yourname/trade-tracker-ibkr-worker
  scripts/build-and-push.sh yourname/trade-tracker-ibkr-worker sha-abc1234
  scripts/build-and-push.sh yourname/trade-tracker-ibkr-worker:0.0.2

Environment:
  PLATFORMS  Optional comma-separated target platforms.
             Default: linux/amd64,linux/arm64
  PLATFORM   Backward-compatible alias for a single platform override
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
default_tag="sha-$(git -C "$repo_root" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
image_input="$1"
image_repo="$image_input"
image_tag=""

if [[ $# -eq 2 ]]; then
  image_tag="$2"
elif [[ "$image_input" == *:* && "${image_input##*/}" == *:* ]]; then
  image_repo="${image_input%:*}"
  image_tag="${image_input##*:}"
fi

if [[ -z "$image_tag" ]]; then
  image_tag="$default_tag"
fi

platforms="${PLATFORMS:-${PLATFORM:-linux/amd64,linux/arm64}}"

build_cmd=(docker buildx build --platform "$platforms" --push)
build_cmd+=(
  -f "$repo_root/Dockerfile"
  -t "$image_repo:$image_tag"
  -t "$image_repo:latest"
  "$repo_root"
)

echo "Building and pushing multi-platform image for: $platforms"
echo "Tags:"
echo "  $image_repo:$image_tag"
echo "  $image_repo:latest"
"${build_cmd[@]}"

echo "Published:"
echo "  $image_repo:$image_tag"
echo "  $image_repo:latest"
