import { describe, expect, it } from 'vitest';
import type { SceneEmptyReason, SceneResponse } from '../../src/shared/scene-contracts';
import { sceneEmptyMessage } from '../../src/client/src/scene-empty-state';

const sceneWith = (
  returnedFeatures: number,
  emptyReason: SceneEmptyReason | null,
): SceneResponse => ({
  meta: { totalFeatures: 10, returnedFeatures, emptyReason },
} as SceneResponse);

describe('floor scene empty state', () => {
  it('does not report loading or non-empty scenes as empty', () => {
    expect(sceneEmptyMessage(undefined)).toBeUndefined();
    expect(sceneEmptyMessage(sceneWith(1, null))).toBeUndefined();
  });

  it.each([
    ['viewport-outside-floor', 'No floor geometry in this viewport. Use Fit to return.'],
    ['no-spatial-features', 'This viewport contains no prepared floor geometry.'],
    ['lod-filtered', 'Geometry exists here but is unavailable at this zoom.'],
  ] as const)('maps %s to a diagnostic message', (reason, message) => {
    expect(sceneEmptyMessage(sceneWith(0, reason))).toBe(message);
  });

  it('provides a defensive fallback for an inconsistent empty response', () => {
    expect(sceneEmptyMessage(sceneWith(0, null))).toBe('The scene request returned no geometry.');
  });
});
