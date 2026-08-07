#!/usr/bin/env bash
set -euo pipefail

task_dir="$(mktemp -d -t building-operator-data.XXXXXX)"
task_catalog="${task_dir}/west-riverside.devices-18000.json.gz"
task_manifest="${task_dir}/west-riverside.devices-18000.manifest.json"

cleanup() {
  rm -f "$task_catalog" "$task_manifest"
  rmdir "$task_dir"
}
trap cleanup EXIT

.venv/bin/python scripts/data-pipeline/generate_devices.py \
  --count 18000 \
  --output "$task_catalog" \
  --manifest "$task_manifest" >/dev/null

cmp data/generated/west-riverside.devices-18000.json.gz "$task_catalog"
cmp data/generated/west-riverside.devices-18000.manifest.json "$task_manifest"

echo "Representative catalog reproducibility check passed"
