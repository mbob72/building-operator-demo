#!/usr/bin/env bash
set -euo pipefail

base_url="https://huggingface.co/datasets/sylvainHellin/ifc-bench/resolve/main/projects/west_riverside_hospital"

download_and_verify() {
  source_name="$1"
  destination="$2"
  expected="$3"

  if [[ -f "$destination" ]]; then
    existing="$(shasum -a 256 "$destination" | awk '{print $1}')"
    if [[ "$existing" == "$expected" ]]; then
      echo "Already verified $destination"
      return
    fi
  fi

  temporary="${destination}.part"
  curl -L --fail "${base_url}/${source_name}?download=true" -o "$temporary"

  actual="$(shasum -a 256 "$temporary" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "$temporary"
    echo "Checksum mismatch for $source_name: expected $expected, got $actual" >&2
    exit 1
  fi

  mv "$temporary" "$destination"
  echo "Downloaded and verified $destination"
}

mkdir -p data/source

download_and_verify \
  "arc_ifc2x3.ifc" \
  "data/source/west-riverside-arc-ifc2x3.ifc" \
  "989ace1d52f694ee94d80bd99aa81d0ff3d76cf21f34fcfd00a286ac897ed8a6"

download_and_verify \
  "elec_ifc2x3.ifc" \
  "data/source/west-riverside-elec-ifc2x3.ifc" \
  "e443ca5e13756de89f50b61256e512925ce38b76d3a20a4a17fa35ffa6650c95"

download_and_verify \
  "fire_ifc2x3.ifc" \
  "data/source/west-riverside-fire-ifc2x3.ifc" \
  "a94a9c179a5d22724576d8f4b668dec94a59b6dd447ea6c8a4ede5206c17201d"

download_and_verify \
  "mech_ifc2x3.ifc" \
  "data/source/west-riverside-mech-ifc2x3.ifc" \
  "0c0551bf150dae56702515a53d55cf7f289d3637ccd7b399b092c47b9fa9272d"

download_and_verify \
  "sprinkle_ifc2x3.ifc" \
  "data/source/west-riverside-sprinkle-ifc2x3.ifc" \
  "99e928f6714b69afd7e709b83f96904d3e3661640df7d5d4391415bd3c977c3e"
