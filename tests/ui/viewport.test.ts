import { describe, expect, it } from 'vitest';
import { fitFloor, viewStateToBBox } from '../../src/client/src/viewport';

describe('viewport conversion', () => {
  it('converts target and zoom to a world bbox', () => {
    expect(viewStateToBBox({ target: [500, 300, 0], zoom: 1 }, 800, 400))
      .toEqual([300, 200, 700, 400]);
  });

  it('fits a floor into the available viewport', () => {
    const result = fitFloor({
      id: 'f1', name: 'Floor', elevation: 0, bounds: [0, 0, 100, 80],
    }, 1_000, 800);

    expect(result.target).toEqual([50, 40, 0]);
    expect(result.zoom).toBeCloseTo(Math.log2(8.6));
  });
});
