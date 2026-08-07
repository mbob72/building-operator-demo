#!/usr/bin/env python3
"""Audit storeys and device-like elements across West Riverside IFC disciplines."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.util.placement
import ifcopenshell.util.unit


DEVICE_LIKE_CLASSES = {
    "IfcActuator",
    "IfcAlarm",
    "IfcController",
    "IfcDistributionControlElement",
    "IfcElectricAppliance",
    "IfcFireSuppressionTerminal",
    "IfcFlowMeter",
    "IfcFlowTerminal",
    "IfcLightFixture",
    "IfcProtectiveDevice",
    "IfcSensor",
    "IfcSwitchingDevice",
    "IfcUnitaryEquipment",
}


def rounded(value: float) -> float:
    return round(value, 4)


def placement_position(element: Any, unit_scale: float) -> list[float] | None:
    if element.ObjectPlacement is None:
        return None
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(element.ObjectPlacement)
    except Exception:
        return None
    return [rounded(float(matrix[index, 3]) * unit_scale) for index in range(3)]


def storey_name(element: Any) -> str | None:
    for relation in element.ContainedInStructure or []:
        structure = relation.RelatingStructure
        if structure.is_a("IfcBuildingStorey"):
            return str(structure.Name)
    return None


def audit(path: Path, discipline: str) -> dict[str, Any]:
    model = ifcopenshell.open(path)
    unit_scale = ifcopenshell.util.unit.calculate_unit_scale(model)
    products = model.by_type("IfcProduct")
    candidates = [product for product in products if product.is_a() in DEVICE_LIKE_CLASSES]

    storeys = []
    for storey in model.by_type("IfcBuildingStorey"):
        position = placement_position(storey, unit_scale)
        contained = [
            element
            for relation in storey.ContainsElements or []
            for element in relation.RelatedElements
        ]
        storeys.append({
            "name": storey.Name,
            "elevation": None if position is None else position[2],
            "containedProducts": len(contained),
            "deviceLikeProducts": sum(
                element.is_a() in DEVICE_LIKE_CLASSES for element in contained
            ),
        })

    by_class = Counter(candidate.is_a() for candidate in candidates)
    by_storey: dict[str, Counter[str]] = defaultdict(Counter)
    positioned = 0
    coordinate_ranges: dict[str, list[float]] = {}
    samples: dict[str, list[dict[str, Any]]] = defaultdict(list)

    positions: list[list[float]] = []
    for candidate in candidates:
        position = placement_position(candidate, unit_scale)
        if position is not None:
            positioned += 1
            positions.append(position)
        floor = storey_name(candidate) or "uncontained"
        by_storey[floor][candidate.is_a()] += 1
        if len(samples[candidate.is_a()]) < 8:
            samples[candidate.is_a()].append({
                "ifcId": candidate.id(),
                "globalId": candidate.GlobalId,
                "name": candidate.Name,
                "objectType": getattr(candidate, "ObjectType", None),
                "storey": None if floor == "uncontained" else floor,
                "position": position,
                "hasRepresentation": candidate.Representation is not None,
            })

    if positions:
        for axis_index, axis in enumerate(("x", "y", "z")):
            values = [position[axis_index] for position in positions]
            coordinate_ranges[axis] = [rounded(min(values)), rounded(max(values))]

    return {
        "discipline": discipline,
        "file": path.name,
        "schema": model.schema,
        "unitScaleToMeters": unit_scale,
        "productCount": len(products),
        "storeys": storeys,
        "deviceLike": {
            "total": len(candidates),
            "positioned": positioned,
            "unpositioned": len(candidates) - positioned,
            "byClass": dict(sorted(by_class.items())),
            "byStorey": {
                floor: dict(sorted(counts.items()))
                for floor, counts in sorted(by_storey.items())
            },
            "coordinateRanges": coordinate_ranges,
            "samples": dict(sorted(samples.items())),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("data/source"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    sources = [
        ("Architecture", "west-riverside-arc-ifc2x3.ifc"),
        ("Electrical", "west-riverside-elec-ifc2x3.ifc"),
        ("Fire Alarm", "west-riverside-fire-ifc2x3.ifc"),
        ("Mechanical", "west-riverside-mech-ifc2x3.ifc"),
        ("Sprinklers", "west-riverside-sprinkle-ifc2x3.ifc"),
    ]
    missing = [file_name for _, file_name in sources if not (args.source_dir / file_name).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing IFC sources: {', '.join(missing)}")

    result = {
        "project": "West Riverside Hospital",
        "license": "CC BY 3.0",
        "disciplines": [
            audit(args.source_dir / file_name, discipline)
            for discipline, file_name in sources
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({
        item["discipline"]: item["deviceLike"]
        for item in result["disciplines"]
    }, indent=2))


if __name__ == "__main__":
    main()
