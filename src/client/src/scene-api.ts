import {
  FloorSummarySchema,
  SceneResponseSchema,
  type FloorSummary,
  type SceneQuery,
  type SceneResponse,
} from '../../shared/scene-contracts';
import { z } from 'zod';

const FloorsResponseSchema = z.object({ floors: z.array(FloorSummarySchema) });

export const loadFloors = async (signal?: AbortSignal): Promise<FloorSummary[]> => {
  const response = await fetch('/api/floors', signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`Floor request failed: ${response.status}`);
  return FloorsResponseSchema.parse(await response.json()).floors;
};

export const loadScene = async (query: SceneQuery, signal?: AbortSignal): Promise<SceneResponse> => {
  const response = await fetch('/api/scene/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Scene request failed: ${response.status}`);
  return SceneResponseSchema.parse(await response.json());
};
