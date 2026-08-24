#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

echo "Running Retro Converter type checks and tests..."
echo

CI=true exec "$project_dir/tools/pnpm.sh" check

