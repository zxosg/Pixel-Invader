#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

echo "Starting Pixel Invader..."
echo "The browser will open automatically when the server is ready."
echo "To reopen it later, type o and press Return."
echo "Press Control-C here to stop it."
echo

"$project_dir/tools/pnpm.sh" --filter @retro-converter/zx-spectrum build
"$project_dir/tools/pnpm.sh" --filter @retro-converter/sinclair-ql build

cd "$project_dir/apps/web"
exec "$project_dir/tools/pnpm.sh" exec vite --open
