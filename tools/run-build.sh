#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

echo "Building the Retro Converter production application..."
echo

CI=true exec "$project_dir/tools/pnpm.sh" build

