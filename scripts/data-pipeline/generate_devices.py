#!/usr/bin/env python3
"""Generate reproducible representative and stress device catalogs."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import random
from collections import Counter
from pathlib import Path
from typing import Any, Callable

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.placement
import ifcopenshell.util.unit
from shapely import concave_hull
from shapely.geometry import MultiPoint, Point, Polygon


BASE_COUNT = 18_000
DEFAULT_SEED = 20_260_807
GENERATED_AT = "2026-08-07T00:00:00.000Z"

CATEGORY_TARGETS = {
    "lighting": 7_000,
    "knx-sensors": 3_200,
    "knx-controls": 1_400,
    "fire-security": 2_600,
    "hvac": 2_200,
    "meters-controllers": 800,
    "access-other": 800,
}

FLOOR_TARGETS = {
    "west-riverside-level-1": 2_900,
    "west-riverside-level-2": 2_850,
    "west-riverside-level-3": 2_800,
    "west-riverside-level-4": 2_600,
    "west-riverside-level-5": 2_500,
    "west-riverside-level-6": 2_400,
    "west-riverside-level-7a": 1_800,
    "west-riverside-level-7": 150,
}

SOURCE_FILES = {
    "architecture": "west-riverside-arc-ifc2x3.ifc",
    "electrical": "west-riverside-elec-ifc2x3.ifc",
    "fire-alarm": "west-riverside-fire-ifc2x3.ifc",
    "mechanical": "west-riverside-mech-ifc2x3.ifc",
    "sprinklers": "west-riverside-sprinkle-ifc2x3.ifc",
}


def rounded(value: float) -> float:
    return round(value, 4)


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scaled_counts(base: dict[str, int], total: int) -> dict[str, int]:
    raw = {key: value * total / BASE_COUNT for key, value in base.items()}
    result = {key: int(value) for key, value in raw.items()}
    missing = total - sum(result.values())
    priority = sorted(base, key=lambda key: (-(raw[key] - result[key]), key))
    for key in priority[:missing]:
        result[key] += 1
    return result


def floor_name(storey: str | None) -> str | None:
    if storey is None:
        return None
    normalized = storey.removesuffix(" Ceiling")
    return f"west-riverside-{normalized.lower().replace(' ', '-')}"


def contained_storey(element: Any) -> str | None:
    for relation in element.ContainedInStructure or []:
        structure = relation.RelatingStructure
        if structure.is_a("IfcBuildingStorey"):
            return str(structure.Name)
    return None


def placement_position(element: Any, unit_scale: float) -> tuple[float, float] | None:
    if element.ObjectPlacement is None:
        return None
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(element.ObjectPlacement)
    except Exception:
        return None
    return float(matrix[0, 3]) * unit_scale, float(matrix[1, 3]) * unit_scale


def geometry_position(
    element: Any,
    settings: ifcopenshell.geom.settings,
) -> tuple[float, float] | None:
    """Return a stable world-space centroid when ObjectPlacement is not representative."""
    try:
        shape = ifcopenshell.geom.create_shape(settings, element)
        vertices = shape.geometry.verts
    except Exception:
        return None
    points = [
        (float(vertices[index]), float(vertices[index + 1]))
        for index in range(0, len(vertices), 3)
    ]
    if not points:
        return None
    centroid = MultiPoint(points).convex_hull.centroid
    return float(centroid.x), float(centroid.y)


def channel(
    key: str,
    label: str,
    value_type: str,
    unit: str | None = None,
    precision: int | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "valueType": value_type,
        "unit": unit,
        "precision": precision,
    }


def capabilities(device_type: str) -> dict[str, Any]:
    definitions: dict[str, tuple[list[dict[str, Any]], list[dict[str, Any]]]] = {
        "light": (
            [channel("on", "Power state", "boolean"), channel("level", "Light level", "number", "%", 0)],
            [
                {"kind": "setOnOff", "requiresConfirmation": False},
                {
                    "kind": "setSetpoint",
                    "unit": "%",
                    "minimum": 0,
                    "maximum": 100,
                    "step": 1,
                    "requiresConfirmation": False,
                },
            ],
        ),
        "presence-sensor": ([channel("occupied", "Occupied", "boolean")], []),
        "temperature-sensor": ([channel("temperature", "Temperature", "number", "°C", 1)], []),
        "co2-sensor": ([channel("co2", "CO₂", "number", "ppm", 0)], []),
        "switch": (
            [channel("on", "Switch state", "boolean")],
            [{"kind": "setOnOff", "requiresConfirmation": False}],
        ),
        "actuator": (
            [channel("on", "Actuator state", "boolean")],
            [{"kind": "setOnOff", "requiresConfirmation": True}],
        ),
        "smoke-detector": ([channel("triggered", "Smoke alarm", "boolean")], []),
        "heat-detector": (
            [channel("triggered", "Heat alarm", "boolean"), channel("temperature", "Temperature", "number", "°C", 1)],
            [],
        ),
        "fire-alarm-sounder": ([channel("active", "Sounder active", "boolean")], []),
        "manual-pull-station": ([channel("triggered", "Manual alarm", "boolean")], []),
        "sprinkler": ([channel("triggered", "Sprinkler active", "boolean")], []),
        "security-sensor": ([channel("triggered", "Security alarm", "boolean")], []),
        "hvac-terminal": (
            [channel("airflow", "Airflow", "number", "m³/h", 0)],
            [],
        ),
        "hvac-unit": (
            [
                channel("on", "Power state", "boolean"),
                channel("temperature", "Temperature", "number", "°C", 1),
                channel("setpoint", "Setpoint", "number", "°C", 1),
            ],
            [
                {"kind": "setOnOff", "requiresConfirmation": True},
                {
                    "kind": "setSetpoint",
                    "unit": "°C",
                    "minimum": 16,
                    "maximum": 30,
                    "step": 0.5,
                    "requiresConfirmation": False,
                },
            ],
        ),
        "meter": (
            [
                channel("power", "Power", "number", "kW", 2),
                channel("energy", "Energy", "number", "kWh", 1),
            ],
            [],
        ),
        "electrical-controller": ([channel("online", "Controller online", "boolean")], []),
        "access-controller": (
            [channel("locked", "Locked", "boolean")],
            [{"kind": "setOnOff", "requiresConfirmation": True}],
        ),
        "solar-panel": (
            [
                channel("power", "Generated power", "number", "kW", 2),
                channel("energy", "Generated energy", "number", "kWh", 1),
            ],
            [],
        ),
        "other": ([channel("value", "Value", "number", None, 2)], []),
    }
    telemetry, commands = definitions[device_type]
    return {"telemetry": telemetry, "commands": commands}


def classify_fire(name: str) -> str:
    lowered = name.lower()
    if "smoke detector" in lowered:
        return "smoke-detector"
    if "manual pull" in lowered:
        return "manual-pull-station"
    if "control panel" in lowered or "terminal cabinet" in lowered:
        return "electrical-controller"
    return "fire-alarm-sounder"


def ifc_device(
    element: Any,
    discipline: str,
    source_file: str,
    floor_id: str,
    position: tuple[float, float],
    protocol: str,
    device_type: str,
) -> dict[str, Any]:
    identifier = f"ifc:{discipline}:{element.GlobalId}"
    return {
        "id": identifier,
        "name": element.Name or f"{device_type} {element.id()}",
        "type": device_type,
        "protocol": protocol,
        "buildingId": "west-riverside",
        "floorId": floor_id,
        "roomId": None,
        "position": {"x": rounded(position[0]), "y": rounded(position[1])},
        "dataOrigin": "ifc",
        "provenance": {
            "kind": "ifc",
            "sourceFile": source_file,
            "ifcGlobalId": element.GlobalId,
            "ifcType": element.is_a(),
            "ifcId": element.id(),
        },
        "binding": {
            "mode": "simulated",
            "protocol": protocol,
            "reference": f"sim:{protocol}:{identifier}",
            "dataOrigin": "synthetic",
        },
        "capabilities": capabilities(device_type),
    }


def load_ifc_devices(
    source_dir: Path,
    floors_by_id: dict[str, dict[str, Any]],
) -> tuple[list[tuple[str, dict[str, Any]]], Counter[str], Counter[str]]:
    devices: list[tuple[str, dict[str, Any]]] = []
    excluded: Counter[str] = Counter()
    recovered: Counter[str] = Counter()

    def include(
        model: Any,
        element: Any,
        discipline: str,
        source_file: str,
        category: str,
        protocol: str,
        device_type: str,
        settings: ifcopenshell.geom.settings,
    ) -> None:
        storey = contained_storey(element)
        floor_id = floor_name(storey)
        if floor_id is None or floor_id not in floors_by_id:
            excluded[f"{discipline}:unmapped-storey"] += 1
            return
        floor = floors_by_id[floor_id]
        _, _, max_x, max_y = floor["bounds"]

        def floor_local(world_position: tuple[float, float]) -> tuple[float, float]:
            return (
                world_position[0] - floor["worldOrigin"][0],
                world_position[1] - floor["worldOrigin"][1],
            )

        def is_inside(local_position: tuple[float, float]) -> bool:
            return 0 <= local_position[0] <= max_x and 0 <= local_position[1] <= max_y

        placement = placement_position(element, ifcopenshell.util.unit.calculate_unit_scale(model))
        local = floor_local(placement) if placement is not None else None
        if local is None or not is_inside(local):
            centroid = geometry_position(element, settings)
            centroid_local = floor_local(centroid) if centroid is not None else None
            if centroid_local is not None and is_inside(centroid_local):
                reason = "missing-placement" if placement is None else "outside-placement"
                recovered[f"{discipline}:geometry-centroid-from-{reason}"] += 1
                local = centroid_local
            else:
                reason = "missing-placement" if placement is None else "outside-architectural-bounds"
                excluded[f"{discipline}:{reason}"] += 1
                return
        devices.append((
            category,
            ifc_device(
                element,
                discipline,
                source_file,
                floor_id,
                local,
                protocol,
                device_type,
            ),
        ))

    configurations: list[tuple[str, Callable[[Any], bool], str, str, Callable[[Any], str]]] = [
        (
            "electrical",
            lambda element: element.is_a() == "IfcFlowTerminal",
            "lighting",
            "dali",
            lambda _element: "light",
        ),
        (
            "fire-alarm",
            lambda element: element.is_a() == "IfcDistributionControlElement"
            or (element.is_a() == "IfcBuildingElementProxy" and "Fire Alarm Control Panel" in (element.Name or "")),
            "fire-security",
            "fire-alarm",
            lambda element: classify_fire(element.Name or ""),
        ),
        (
            "mechanical",
            lambda element: element.is_a() == "IfcFlowTerminal",
            "hvac",
            "modbus",
            lambda _element: "hvac-terminal",
        ),
        (
            "sprinklers",
            lambda element: element.is_a() == "IfcFlowTerminal",
            "fire-security",
            "fire-alarm",
            lambda _element: "sprinkler",
        ),
        (
            "architecture",
            lambda element: element.is_a() == "IfcBuildingElementProxy"
            and "Sunpower E19 Solar Panel" in (element.Name or ""),
            "access-other",
            "virtual",
            lambda _element: "solar-panel",
        ),
    ]

    for discipline, predicate, category, protocol, type_for in configurations:
        source_file = SOURCE_FILES[discipline]
        model = ifcopenshell.open(source_dir / source_file)
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        for product in model.by_type("IfcProduct"):
            if predicate(product):
                include(
                    model,
                    product,
                    discipline,
                    source_file,
                    category,
                    protocol,
                    type_for(product),
                    settings,
                )

    return devices, excluded, recovered


def placement_region(scene_path: Path) -> Polygon:
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    points = [
        coordinate
        for feature in scene["features"]
        if feature["geometryType"] == "polygon"
        for coordinate in feature["coordinates"]
    ]
    if len(points) < 3:
        raise ValueError(f"Not enough placement points in {scene_path}")
    cloud = MultiPoint(points)
    region = concave_hull(cloud, ratio=0.35, allow_holes=False)
    if not isinstance(region, Polygon) or region.area <= 0:
        region = cloud.convex_hull
    inner = region.buffer(-0.25)
    if isinstance(inner, Polygon) and inner.area > 1:
        region = inner
    return region


def random_position(region: Polygon, rng: random.Random) -> tuple[float, float]:
    min_x, min_y, max_x, max_y = region.bounds
    for _ in range(20_000):
        point = Point(rng.uniform(min_x, max_x), rng.uniform(min_y, max_y))
        if region.contains(point):
            return rounded(point.x), rounded(point.y)
    point = region.representative_point()
    return rounded(point.x), rounded(point.y)


def choose_floor(remaining: dict[str, int], rng: random.Random) -> str:
    total = sum(remaining.values())
    if total <= 0:
        raise RuntimeError("No remaining floor capacity")
    selected = rng.randrange(total)
    cursor = 0
    for floor_id, count in remaining.items():
        cursor += count
        if selected < cursor:
            remaining[floor_id] -= 1
            return floor_id
    raise AssertionError("floor selection fell through")


def synthetic_type(category: str, index: int) -> tuple[str, str]:
    if category == "lighting":
        return "light", "dali"
    if category == "knx-sensors":
        sensor_types = [
            "presence-sensor",
            "presence-sensor",
            "temperature-sensor",
            "co2-sensor",
        ]
        return sensor_types[index % len(sensor_types)], "knx"
    if category == "knx-controls":
        return ("switch" if index % 2 == 0 else "actuator"), "knx"
    if category == "fire-security":
        return "security-sensor", "security"
    if category == "hvac":
        return "hvac-unit", "modbus"
    if category == "meters-controllers":
        return ("meter" if index % 4 != 3 else "electrical-controller"), "modbus"
    if category == "access-other":
        return ("access-controller" if index % 4 != 3 else "other"), "access-control"
    raise ValueError(category)


def synthetic_device(
    category: str,
    index: int,
    floor_id: str,
    position: tuple[float, float],
    seed: int,
) -> dict[str, Any]:
    device_type, protocol = synthetic_type(category, index)
    identifier = f"syn:{category}:{index + 1:06d}"
    return {
        "id": identifier,
        "name": f"{device_type.replace('-', ' ').title()} {index + 1:06d}",
        "type": device_type,
        "protocol": protocol,
        "buildingId": "west-riverside",
        "floorId": floor_id,
        "roomId": None,
        "position": {"x": position[0], "y": position[1]},
        "dataOrigin": "synthetic",
        "provenance": {
            "kind": "synthetic",
            "generator": "west-riverside-device-generator-v1",
            "seed": seed,
        },
        "binding": {
            "mode": "simulated",
            "protocol": protocol,
            "reference": f"sim:{protocol}:{identifier}",
            "dataOrigin": "synthetic",
        },
        "capabilities": capabilities(device_type),
    }


def generate(
    source_dir: Path,
    generated_dir: Path,
    count: int,
    seed: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    floor_index = json.loads(
        (generated_dir / "west-riverside.floor-index.json").read_text(encoding="utf-8")
    )
    floors_by_id = {floor["id"]: floor for floor in floor_index["floors"]}
    target_categories = scaled_counts(CATEGORY_TARGETS, count)
    target_floors = scaled_counts(FLOOR_TARGETS, count)

    ifc_entries, excluded, recovered = load_ifc_devices(source_dir, floors_by_id)
    actual_by_category = Counter(category for category, _ in ifc_entries)
    actual_by_floor = Counter(device["floorId"] for _, device in ifc_entries)

    for category, actual in actual_by_category.items():
        if actual > target_categories[category]:
            raise ValueError(f"IFC count exceeds target for {category}: {actual}")
    for floor_id, actual in actual_by_floor.items():
        if actual > target_floors[floor_id]:
            raise ValueError(f"IFC count exceeds target for {floor_id}: {actual}")

    remaining_floors = {
        floor_id: target - actual_by_floor[floor_id]
        for floor_id, target in target_floors.items()
    }
    regions = {
        floor_id: placement_region(generated_dir / floor["sceneFile"])
        for floor_id, floor in floors_by_id.items()
    }
    rng = random.Random(seed)
    devices = [device for _, device in ifc_entries]

    for category, target in target_categories.items():
        synthetic_count = target - actual_by_category[category]
        for index in range(synthetic_count):
            floor_id = choose_floor(remaining_floors, rng)
            position = random_position(regions[floor_id], rng)
            devices.append(synthetic_device(category, index, floor_id, position, seed))

    if any(remaining_floors.values()):
        raise AssertionError(f"Unfilled floor targets: {remaining_floors}")

    floor_order = {floor["id"]: floor["order"] for floor in floor_index["floors"]}
    devices.sort(key=lambda device: (floor_order[device["floorId"]], device["id"]))
    floors = [
        {
            "id": floor["id"],
            "buildingId": "west-riverside",
            "name": floor["name"],
            "elevation": floor["elevation"],
            "bounds": floor["bounds"],
            "order": floor["order"],
        }
        for floor in floor_index["floors"]
    ]
    catalog = {
        "catalogVersion": f"west-riverside-{count}-seed-{seed}-v1",
        "generatedAt": GENERATED_AT,
        "building": floor_index["building"],
        "floors": floors,
        "devices": devices,
        "totalDevices": len(devices),
    }
    stats = {
        "requestedDevices": count,
        "seed": seed,
        "actualIfcDevices": sum(actual_by_category.values()),
        "syntheticDevices": count - sum(actual_by_category.values()),
        "byCategory": target_categories,
        "byFloor": dict(Counter(device["floorId"] for device in devices)),
        "byType": dict(sorted(Counter(device["type"] for device in devices).items())),
        "byProtocol": dict(sorted(Counter(device["protocol"] for device in devices).items())),
        "byOrigin": dict(sorted(Counter(device["dataOrigin"] for device in devices).items())),
        "ifcByCategory": dict(sorted(actual_by_category.items())),
        "recoveredIfcCandidates": dict(sorted(recovered.items())),
        "excludedIfcCandidates": dict(sorted(excluded.items())),
        "sourceSha256": {
            source_file: sha256_file(source_dir / source_file)
            for source_file in SOURCE_FILES.values()
        },
    }
    return catalog, stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=Path("data/source"))
    parser.add_argument("--generated-dir", type=Path, default=Path("data/generated"))
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()

    if args.count < BASE_COUNT:
        raise ValueError(f"Catalog count must be at least {BASE_COUNT}")
    catalog, stats = generate(args.source_dir, args.generated_dir, args.count, args.seed)
    raw = json.dumps(catalog, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(compressed)
    manifest = {
        "catalogVersion": catalog["catalogVersion"],
        "catalogFile": args.output.name,
        "uncompressedBytes": len(raw),
        "compressedBytes": len(compressed),
        "uncompressedSha256": sha256_bytes(raw),
        "compressedSha256": sha256_bytes(compressed),
        "stats": stats,
    }
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
