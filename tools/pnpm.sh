#!/bin/sh

set -eu

if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  exec pnpm "$@"
fi

runtime_root="/Users/jan/.cache/codex-runtimes/codex-primary-runtime/dependencies"
bundled_node="$runtime_root/node/bin/node"
bundled_pnpm="$runtime_root/bin/fallback/pnpm"

if [ -x "$bundled_node" ] && [ -x "$bundled_pnpm" ]; then
  PATH="$runtime_root/node/bin:$runtime_root/bin/fallback:$PATH"
  export PATH
  exec "$bundled_pnpm" "$@"
fi

echo "Node.js and pnpm were not found." >&2
echo "Install Node.js and pnpm, then run this command again." >&2
exit 1
