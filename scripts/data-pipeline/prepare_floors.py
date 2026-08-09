#!/usr/bin/env python3
"""Prepare every architectural floor scene and a shared coordinate index."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from extract_floor import extract_with_metadata


STOREYS = [
    "Level 1",
    "Level 2",
    "Level 3",
    "Level 4",
    "Level 5",
    "Level 6",
    "Level 7A",
    "Level 7",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare(ifc_path: Path, output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    floors = []

    for order, storey_name in enumerate(STOREYS, start=1):
        scene, metadata = extract_with_metadata(ifc_path, storey_name)
        scene_file = f"{metadata['id']}.scene.json"
        (output_dir / scene_file).write_text(
            json.dumps(scene, separators=(",", ":")),
            encoding="utf-8",
        )
        floors.append({
            **metadata,
            "order": order,
            "sceneFile": scene_file,
        })
        print(
            f"prepared {storey_name}: {metadata['featureCount']} features "
            f"({metadata['byZoomBand']})"
        )

    index = {
        "datasetVersion": "west-riverside-stage-2-v2",
        "generatedAt": "2026-08-07T00:00:00.000Z",
        "building": {
            "id": "west-riverside",
            "name": "West Riverside Hospital",
            "timezone": "Etc/UTC",
        },
        "source": {
            "file": ifc_path.name,
            "sha256": sha256(ifc_path),
            "license": "CC BY 3.0",
        },
        "floors": floors,
    }
    (output_dir / "west-riverside.floor-index.json").write_text(
        json.dumps(index, indent=2),
        encoding="utf-8",
    )
    return index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--ifc",
        type=Path,
        default=Path("data/source/west-riverside-arc-ifc2x3.ifc"),
    )
    parser.add_argument("--output-dir", type=Path, default=Path("data/generated"))
    args = parser.parse_args()

    if not args.ifc.is_file():
        raise FileNotFoundError(args.ifc)
    prepare(args.ifc, args.output_dir)


if __name__ == "__main__":
    main()
