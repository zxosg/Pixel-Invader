#!/usr/bin/env bash
# Compare two smoke-test output directories (screenshots byte-for-byte, exports by hash;
# the metadata JSON hash is ignored because it contains non-deterministic fields).
set -u
before="$1"; after="$2"; status=0
for f in "$before"/*.png; do
  name=$(basename "$f")
  [ "$name" = "zz-failure.png" ] && continue
  cmp -s "$f" "$after/$name" || { echo "screenshot differs: $name"; status=1; }
done
norm() { grep -v '"sha256"' "$1/report.json" > /dev/null; node -e '
const r=JSON.parse(require("fs").readFileSync(process.argv[1]+"/report.json","utf8"));
delete r.exports.meta.sha256; console.log(JSON.stringify(r));' "$1"; }
[ "$(norm "$before")" = "$(norm "$after")" ] || { echo "report differs"; status=1; }
[ $status -eq 0 ] && echo "smoke outputs identical"
exit $status
