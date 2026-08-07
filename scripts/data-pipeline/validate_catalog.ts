import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { DeviceCatalogSchema } from '../../src/shared/domain-contracts.js';

const ManifestSchema = z.object({
  catalogVersion: z.string(),
  catalogFile: z.string(),
  uncompressedBytes: z.number().int().positive(),
  compressedBytes: z.number().int().positive(),
  uncompressedSha256: z.string().length(64),
  compressedSha256: z.string().length(64),
  stats: z.object({
    requestedDevices: z.number().int().positive(),
    actualIfcDevices: z.number().int().nonnegative(),
    syntheticDevices: z.number().int().nonnegative(),
  }).passthrough(),
}).passthrough();

const [catalogPath, manifestPath] = process.argv.slice(2);
if (catalogPath === undefined || manifestPath === undefined) {
  throw new Error('Usage: validate_catalog.ts <catalog.json.gz> <manifest.json>');
}

const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');
const compressed = readFileSync(catalogPath);
const raw = gunzipSync(compressed);
const manifest = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));

const failures: string[] = [];
if (basename(catalogPath) !== manifest.catalogFile) failures.push('catalog filename mismatch');
if (compressed.length !== manifest.compressedBytes) failures.push('compressed size mismatch');
if (raw.length !== manifest.uncompressedBytes) failures.push('uncompressed size mismatch');
if (sha256(compressed) !== manifest.compressedSha256) failures.push('compressed checksum mismatch');
if (sha256(raw) !== manifest.uncompressedSha256) failures.push('uncompressed checksum mismatch');

const parsed = DeviceCatalogSchema.safeParse(JSON.parse(raw.toString('utf8')));
if (!parsed.success) {
  throw new Error(`Catalog contract validation failed:\n${z.prettifyError(parsed.error)}`);
}

const catalog = parsed.data;
if (catalog.catalogVersion !== manifest.catalogVersion) failures.push('catalog version mismatch');
if (catalog.totalDevices !== manifest.stats.requestedDevices) failures.push('device count mismatch');
if (manifest.stats.actualIfcDevices + manifest.stats.syntheticDevices !== catalog.totalDevices) {
  failures.push('origin counts do not sum to total');
}

const floors = new Map(catalog.floors.map((floor) => [floor.id, floor]));
for (const device of catalog.devices) {
  const floor = floors.get(device.floorId);
  if (floor === undefined) {
    failures.push(`missing floor for ${device.id}`);
    continue;
  }
  const [minX, minY, maxX, maxY] = floor.bounds;
  if (device.position.x < minX || device.position.x > maxX
    || device.position.y < minY || device.position.y > maxY) {
    failures.push(`out-of-bounds position for ${device.id}`);
  }
  if (device.binding.mode !== 'simulated' || device.binding.dataOrigin !== 'synthetic') {
    failures.push(`unsafe binding for ${device.id}`);
  }
}

if (failures.length > 0) {
  throw new Error(failures.slice(0, 20).join('\n'));
}

console.log(JSON.stringify({
  catalogVersion: catalog.catalogVersion,
  devices: catalog.totalDevices,
  floors: catalog.floors.length,
  ifc: manifest.stats.actualIfcDevices,
  synthetic: manifest.stats.syntheticDevices,
  compressedBytes: compressed.length,
  status: 'valid',
}, null, 2));
