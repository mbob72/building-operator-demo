#!/usr/bin/env bash
set -euo pipefail

destination="data/source/west-riverside-arc-ifc2x3.ifc"
expected="989ace1d52f694ee94d80bd99aa81d0ff3d76cf21f34fcfd00a286ac897ed8a6"

mkdir -p data/source
curl -L --fail \
  'https://huggingface.co/datasets/sylvainHellin/ifc-bench/resolve/main/projects/west_riverside_hospital/arc_ifc2x3.ifc?download=true' \
  -o "$destination"

actual="$(shasum -a 256 "$destination" | awk '{print $1}')"
if [[ "$actual" != "$expected" ]]; then
  echo "Checksum mismatch: expected $expected, got $actual" >&2
  exit 1
fi

echo "Downloaded and verified $destination"
