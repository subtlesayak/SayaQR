export interface PrintDimensionsInput {
  layerHeightMm?: number;
  nozzleMm?: number;
  bridgeWidthMm?: number;
  baseHeightMm?: number;
  moduleHeightMm?: number;
  undersideThicknessMm?: number;
}

const finite = (value: number | undefined, fallback: number): number => value !== undefined && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function printDimensions(input: PrintDimensionsInput = {}) {
  const layerHeightMm = clamp(finite(input.layerHeightMm, 0.2), 0.05, 0.4);
  const nozzleMm = clamp(finite(input.nozzleMm, 0.4), 0.2, 1);
  const layers = (height: number, minimum: number): number => Math.max(minimum, Math.ceil(height / layerHeightMm - 1e-8));
  const baseLayers = layers(finite(input.baseHeightMm, 2), 2);
  const reliefLayers = layers(finite(input.moduleHeightMm, 1.2), 1);
  const bottomLayers = clamp(layers(finite(input.undersideThicknessMm, 0.4), 0), 0, baseLayers - 1);
  const mm = (count: number): number => Number((count * layerHeightMm).toFixed(4));
  return {
    layerHeightMm, nozzleMm,
    bridgeWidthMm: clamp(finite(input.bridgeWidthMm, nozzleMm), nozzleMm, 2),
    baseLayers, reliefLayers, bottomLayers,
    baseHeightMm: mm(baseLayers), moduleHeightMm: mm(reliefLayers), undersideThicknessMm: mm(bottomLayers),
  };
}
