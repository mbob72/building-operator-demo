import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z, type ZodType } from 'zod';
import {
  AlarmSchema,
  CommandDraftSchema,
  CommandRecordSchema,
  DeviceCatalogSchema,
  DeviceMetadataSchema,
  DeviceTelemetryPatchSchema,
  DeviceTelemetrySchema,
} from '../../src/shared/domain-contracts.js';
import {
  AcknowledgeAlarmRequestSchema,
  AcknowledgeAlarmResponseSchema,
  ApiErrorSchema,
  CatalogQuerySchema,
  CatalogResponseSchema,
  CommandResponseSchema,
  CreateCommandRequestSchema,
  CreateCommandResponseSchema,
  StateSnapshotQuerySchema,
  StateSnapshotSchema,
} from '../../src/shared/api-contracts.js';
import {
  ClientRealtimeMessageSchema,
  EventBatchMessageSchema,
  RealtimeEventSchema,
  ResyncRequiredMessageSchema,
  ServerRealtimeMessageSchema,
} from '../../src/shared/realtime-contracts.js';

const checkOnly = process.argv.includes('--check');
const contractsDirectory = resolve(process.cwd(), 'contracts');

const createDocument = (
  id: string,
  title: string,
  definitions: Record<string, ZodType>,
) => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `https://building-operator.local/contracts/${id}`,
  title,
  description: 'Generated from the runtime Zod contracts. Do not edit by hand.',
  $defs: Object.fromEntries(Object.entries(definitions).map(([name, schema]) => {
    const jsonSchema = z.toJSONSchema(schema, { target: 'draft-2020-12' });
    delete jsonSchema.$schema;
    return [name, jsonSchema];
  })),
});

const documents = {
  'domain.schema.json': createDocument('domain.schema.json', 'Building operator domain contracts', {
    DeviceMetadata: DeviceMetadataSchema,
    DeviceCatalog: DeviceCatalogSchema,
    DeviceTelemetry: DeviceTelemetrySchema,
    DeviceTelemetryPatch: DeviceTelemetryPatchSchema,
    Alarm: AlarmSchema,
    CommandDraft: CommandDraftSchema,
    CommandRecord: CommandRecordSchema,
  }),
  'api.schema.json': createDocument('api.schema.json', 'Building operator REST contracts', {
    ApiError: ApiErrorSchema,
    CatalogQuery: CatalogQuerySchema,
    CatalogResponse: CatalogResponseSchema,
    StateSnapshotQuery: StateSnapshotQuerySchema,
    StateSnapshot: StateSnapshotSchema,
    AcknowledgeAlarmRequest: AcknowledgeAlarmRequestSchema,
    AcknowledgeAlarmResponse: AcknowledgeAlarmResponseSchema,
    CreateCommandRequest: CreateCommandRequestSchema,
    CreateCommandResponse: CreateCommandResponseSchema,
    CommandResponse: CommandResponseSchema,
  }),
  'realtime.schema.json': createDocument('realtime.schema.json', 'Building operator realtime contracts', {
    RealtimeEvent: RealtimeEventSchema,
    ClientRealtimeMessage: ClientRealtimeMessageSchema,
    ServerRealtimeMessage: ServerRealtimeMessageSchema,
    EventBatchMessage: EventBatchMessageSchema,
    ResyncRequiredMessage: ResyncRequiredMessageSchema,
  }),
};

mkdirSync(contractsDirectory, { recursive: true });

let stale = false;
for (const [fileName, document] of Object.entries(documents)) {
  const path = resolve(contractsDirectory, fileName);
  const content = `${JSON.stringify(document, null, 2)}\n`;

  if (checkOnly) {
    let existing = '';
    try {
      existing = readFileSync(path, 'utf8');
    } catch {
      // Missing generated output is reported with the same actionable message.
    }
    if (existing !== content) {
      stale = true;
      console.error(`${fileName} is stale; run npm run contracts:generate`);
    }
  } else {
    writeFileSync(path, content);
    console.log(`generated ${fileName}`);
  }
}

if (stale) process.exit(1);
