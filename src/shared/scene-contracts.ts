import { z } from 'zod';

export const BBoxSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]).refine(([minX, minY, maxX, maxY]) => minX < maxX && minY < maxY, {
  message: 'bbox must have positive width and height',
});

export const SceneQuerySchema = z.object({
  floorId: z.string().min(1),
  viewport: z.object({
    bbox: BBoxSchema,
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
  }),
  zoom: z.number().finite().min(-8).max(24),
});

const FeatureBaseSchema = z.object({
  id: z.string(),
  kind: z.enum(['floor-shell', 'zone', 'wall', 'column', 'door', 'window', 'stair', 'label']),
  bbox: BBoxSchema,
  minZoom: z.number(),
  maxZoom: z.number(),
  ifcId: z.number().int().positive().optional(),
  ifcType: z.string().optional(),
  name: z.string().nullable().optional(),
});

export const SceneFeatureSchema = z.discriminatedUnion('geometryType', [
  FeatureBaseSchema.extend({
    geometryType: z.literal('polygon'),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(3),
  }),
  FeatureBaseSchema.extend({
    geometryType: z.literal('path'),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
    width: z.number().positive(),
  }),
  FeatureBaseSchema.extend({
    geometryType: z.literal('point'),
    coordinates: z.tuple([z.number(), z.number()]),
    text: z.string(),
  }),
]);

export const FloorSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  elevation: z.number(),
  bounds: BBoxSchema,
});

export const SceneSourceSchema = z.object({
  project: z.string(),
  discipline: z.string(),
  file: z.string(),
  schema: z.string(),
  license: z.string(),
  storey: z.string(),
  sectionHeightMeters: z.number(),
  extractionMode: z.enum(['horizontal-section', 'horizontal-projection']).optional(),
});

export const PreparedSceneSchema = z.object({
  source: SceneSourceSchema,
  floor: FloorSummarySchema,
  features: z.array(SceneFeatureSchema),
  stats: z.object({
    featureCount: z.number().int().nonnegative(),
    byKind: z.record(z.string(), z.number().int().nonnegative()),
    byZoomBand: z.object({
      overview: z.number().int().nonnegative(),
      standard: z.number().int().nonnegative(),
      detail: z.number().int().nonnegative(),
    }).optional(),
  }),
});

export const SceneResponseSchema = z.object({
  sceneVersion: z.string(),
  source: SceneSourceSchema,
  floor: FloorSummarySchema,
  request: SceneQuerySchema,
  zoomBand: z.enum(['overview', 'standard', 'detail']),
  features: z.array(SceneFeatureSchema),
  meta: z.object({
    totalFeatures: z.number().int().nonnegative(),
    returnedFeatures: z.number().int().nonnegative(),
  }),
});

export type BBox = z.infer<typeof BBoxSchema>;
export type SceneQuery = z.infer<typeof SceneQuerySchema>;
export type SceneFeature = z.infer<typeof SceneFeatureSchema>;
export type FloorSummary = z.infer<typeof FloorSummarySchema>;
export type SceneResponse = z.infer<typeof SceneResponseSchema>;
export type PreparedScene = z.infer<typeof PreparedSceneSchema>;
