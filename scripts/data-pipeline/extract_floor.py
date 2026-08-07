#!/usr/bin/env python3
"""Extract a compact 2D floor scene from an IFC horizontal section."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.placement
import ifcopenshell.util.unit
import numpy as np
from shapely.geometry import LineString
from shapely.ops import polygonize, unary_union


CATEGORIES = {
    "IfcWall": ("wall", -8.0),
    "IfcWallStandardCase": ("wall", -8.0),
    "IfcColumn": ("column", -8.0),
    "IfcCurtainWall": ("window", 3.8),
    "IfcDoor": ("door", 4.2),
    "IfcWindow": ("window", 4.2),
    "IfcStair": ("stair", 3.4),
    "IfcStairFlight": ("stair", 3.4),
}


def triangle_section_segments(
    vertices: np.ndarray,
    faces: np.ndarray,
    plane_z: float,
    epsilon: float = 1e-7,
) -> list[LineString]:
    segments: list[LineString] = []
    for face in faces:
        triangle = vertices[face]
        distances = triangle[:, 2] - plane_z
        if np.all(distances > epsilon) or np.all(distances < -epsilon):
            continue

        points: list[tuple[float, float]] = []
        for index_a, index_b in ((0, 1), (1, 2), (2, 0)):
            point_a = triangle[index_a]
            point_b = triangle[index_b]
            distance_a = distances[index_a]
            distance_b = distances[index_b]
            if abs(distance_a) <= epsilon:
                points.append((float(point_a[0]), float(point_a[1])))
            if distance_a * distance_b < -(epsilon * epsilon):
                ratio = distance_a / (distance_a - distance_b)
                crossing = point_a + ratio * (point_b - point_a)
                points.append((float(crossing[0]), float(crossing[1])))

        unique: list[tuple[float, float]] = []
        for point in points:
            if not any(math.dist(point, other) <= epsilon for other in unique):
                unique.append(point)
        if len(unique) == 2 and math.dist(unique[0], unique[1]) > epsilon:
            segments.append(LineString(unique))
    return segments


def element_polygons(
    settings: ifcopenshell.geom.settings,
    element: Any,
    plane_z: float,
) -> list[Any]:
    try:
        shape = ifcopenshell.geom.create_shape(settings, element)
        vertices = np.asarray(shape.geometry.verts, dtype=float).reshape((-1, 3))
        faces = np.asarray(shape.geometry.faces, dtype=int).reshape((-1, 3))
    except Exception:
        return []
    if not len(vertices) or plane_z < vertices[:, 2].min() or plane_z > vertices[:, 2].max():
        return []
    segments = triangle_section_segments(vertices, faces, plane_z)
    if not segments:
        return []
    return [
        polygon.simplify(0.003, preserve_topology=True)
        for polygon in polygonize(unary_union(segments))
        if polygon.area >= 0.002
    ]


def contained_elements(storey: Any) -> list[Any]:
    return [
        element
        for relation in (storey.ContainsElements or [])
        for element in relation.RelatedElements
    ]


def rounded(value: float) -> float:
    return round(value, 4)


def extract(ifc_path: Path, storey_name: str) -> dict[str, Any]:
    model = ifcopenshell.open(ifc_path)
    storey = next(
        (candidate for candidate in model.by_type("IfcBuildingStorey") if candidate.Name == storey_name),
        None,
    )
    if storey is None:
        available = ", ".join(str(item.Name) for item in model.by_type("IfcBuildingStorey"))
        raise ValueError(f"Storey {storey_name!r} not found. Available: {available}")

    unit_scale = ifcopenshell.util.unit.calculate_unit_scale(model)
    placement = ifcopenshell.util.placement.get_local_placement(storey.ObjectPlacement)
    storey_z = float(placement[2, 3]) * unit_scale
    plane_z = storey_z + 1.2

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    extracted: list[dict[str, Any]] = []

    for element in contained_elements(storey):
        category = CATEGORIES.get(element.is_a())
        if category is None:
            continue
        kind, min_zoom = category
        for polygon_index, polygon in enumerate(element_polygons(settings, element, plane_z)):
            coordinates = list(polygon.exterior.coords)[:-1]
            if len(coordinates) < 3:
                continue
            extracted.append({
                "id": f"ifc-{element.id()}-{polygon_index}",
                "kind": kind,
                "geometryType": "polygon",
                "coordinates": coordinates,
                "minZoom": min_zoom,
                "maxZoom": 24.0,
                "ifcId": element.id(),
                "ifcType": element.is_a(),
                "name": element.Name,
            })

    if not extracted:
        raise RuntimeError("Horizontal section produced no polygons")

    min_x = min(point[0] for feature in extracted for point in feature["coordinates"])
    min_y = min(point[1] for feature in extracted for point in feature["coordinates"])
    max_x = max(point[0] for feature in extracted for point in feature["coordinates"])
    max_y = max(point[1] for feature in extracted for point in feature["coordinates"])
    margin = 2.0

    for feature in extracted:
        normalized = [
            [rounded(point[0] - min_x + margin), rounded(point[1] - min_y + margin)]
            for point in feature["coordinates"]
        ]
        feature["coordinates"] = normalized
        xs = [point[0] for point in normalized]
        ys = [point[1] for point in normalized]
        feature["bbox"] = [min(xs), min(ys), max(xs), max(ys)]

    width = max_x - min_x + margin * 2
    height = max_y - min_y + margin * 2
    counts: dict[str, int] = {}
    for feature in extracted:
        counts[feature["kind"]] = counts.get(feature["kind"], 0) + 1

    return {
        "source": {
            "project": "West Riverside Hospital",
            "discipline": "Architecture",
            "file": ifc_path.name,
            "schema": model.schema,
            "license": "CC BY 3.0",
            "storey": storey_name,
            "sectionHeightMeters": 1.2,
        },
        "floor": {
            "id": "west-riverside-level-1",
            "name": f"West Riverside Hospital · {storey_name}",
            "elevation": rounded(storey_z),
            "bounds": [0.0, 0.0, rounded(width), rounded(height)],
        },
        "features": extracted,
        "stats": {"featureCount": len(extracted), "byKind": counts},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ifc", type=Path, required=True)
    parser.add_argument("--storey", default="Level 1")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    result = extract(args.ifc, args.storey)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(result["stats"], indent=2))


if __name__ == "__main__":
    main()
