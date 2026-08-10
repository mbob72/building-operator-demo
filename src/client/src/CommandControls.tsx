import React, { useEffect, useMemo, useState } from 'react';
import type {
  CommandCapability,
  CommandIntent,
  CommandRecord,
  DeviceMetadata,
  DeviceTelemetry,
} from '../../shared/domain-contracts';
import { CommandSubmissionError, createCommand } from './operator-api';
import { useOperatorStore } from './operator-store';
import { operatorRealtimeStore } from './realtime-hot-store';
import { useRealtimeSelector } from './use-realtime-state';

interface CommandControlsProps {
  device: DeviceMetadata;
  telemetry: DeviceTelemetry | undefined;
  commands: CommandRecord[];
}

const actorId = 'demo-operator';

const initialIntent = (capability: CommandCapability): CommandIntent => (
  capability.kind === 'setOnOff'
    ? { kind: 'setOnOff', value: true }
    : { kind: 'setSetpoint', value: capability.minimum }
);

const createDraft = (deviceId: string, capability: CommandCapability) => ({
  state: 'draft' as const,
  clientRequestId: crypto.randomUUID(),
  requestedAt: null,
  deviceId,
  intent: initialIntent(capability),
  requiresConfirmation: capability.requiresConfirmation,
});

export const formatCommandIntent = (intent: CommandIntent, unit?: string) => (
  intent.kind === 'setOnOff'
    ? (intent.value ? 'ON' : 'OFF')
    : `${intent.value}${unit ? ` ${unit}` : ''}`
);

const actualValue = (intent: CommandIntent, telemetry: DeviceTelemetry | undefined) => {
  const values = telemetry?.values ?? {};
  if (intent.kind === 'setOnOff') {
    const value = values.on ?? values.active ?? values.online ?? values.locked
      ?? Object.values(values).find((item) => typeof item === 'boolean');
    return typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : 'not reported';
  }
  const value = values.setpoint ?? values.level
    ?? Object.values(values).find((item) => typeof item === 'number');
  return typeof value === 'number' ? String(value) : 'not reported';
};

const commandTimestamp = (command: CommandRecord) => (
  command.executedAt ?? command.failedAt ?? command.timedOutAt
  ?? command.acceptedAt ?? command.requestedAt
);

export const CommandControls = ({ device, telemetry, commands }: CommandControlsProps) => {
  const capabilities = device.capabilities.commands;
  const draft = useOperatorStore((state) => state.commandDraft);
  const setDraft = useOperatorStore((state) => state.setCommandDraft);
  const connectionStatus = useRealtimeSelector((snapshot) => snapshot.connectionStatus);
  const [capabilityIndex, setCapabilityIndex] = useState(0);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [error, setError] = useState<string>();
  const capability = capabilities[capabilityIndex];

  useEffect(() => {
    setCapabilityIndex(0);
    setError(undefined);
    const first = capabilities[0];
    setSubmissionUncertain(false);
    setDraft(first ? createDraft(device.id, first) : undefined);
    return () => setDraft(undefined);
  }, [device.id, capabilities, setDraft]);

  const orderedCommands = useMemo(() => [...commands].sort((left, right) => (
    right.requestedAt.localeCompare(left.requestedAt)
  )).slice(0, 5), [commands]);

  if (!capability || !draft || draft.deviceId !== device.id) {
    return (
      <section className="device-card__commands" aria-label="Device commands">
        <p>COMMANDS</p>
        <span className="command-controls__empty">No control capabilities</span>
      </section>
    );
  }

  const updateCapability = (index: number) => {
    const next = capabilities[index];
    if (!next) return;
    setCapabilityIndex(index);
    setDraft(createDraft(device.id, next));
    setSubmissionUncertain(false);
    setError(undefined);
  };

  const submit = async (confirmed: boolean) => {
    const requestedAt = draft.requestedAt ?? new Date().toISOString();
    const submittedRequestId = draft.clientRequestId;
    if (draft.requestedAt === null) setDraft({ ...draft, requestedAt });
    setSubmitting(true);
    setError(undefined);
    try {
      const command = await createCommand({
        clientRequestId: submittedRequestId,
        deviceId: device.id,
        intent: draft.intent,
        requestedAt,
        requestedBy: actorId,
        confirmation: confirmed ? { confirmedAt: requestedAt, confirmedBy: actorId } : null,
      });
      operatorRealtimeStore.upsertCommand(command);
      setConfirmationOpen(false);
      setSubmissionUncertain(false);
      const currentDraft = useOperatorStore.getState().commandDraft;
      if (currentDraft?.deviceId === device.id
        && currentDraft.clientRequestId === submittedRequestId) {
        setDraft({
          ...currentDraft,
          clientRequestId: crypto.randomUUID(),
          requestedAt: null,
        });
      }
    } catch (submissionError) {
      const outcomeUnknown = submissionError instanceof CommandSubmissionError
        && submissionError.outcomeUnknown;
      setSubmissionUncertain(outcomeUnknown);
      if (outcomeUnknown) setConfirmationOpen(false);
      setError(submissionError instanceof Error ? submissionError.message : 'Command request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const requestSubmission = () => {
    if (submissionUncertain) void submit(draft.requiresConfirmation);
    else if (draft.requiresConfirmation) setConfirmationOpen(true);
    else void submit(false);
  };
  const unit = capability.kind === 'setSetpoint' ? capability.unit : undefined;

  return (
    <section className="device-card__commands" aria-label="Device commands">
      <p>COMMANDS</p>
      <div className="command-controls__form">
        {capabilities.length > 1 && (
          <label>
            <span>Action</span>
            <select
              aria-label="Command action"
              value={capabilityIndex}
              onChange={(event) => updateCapability(Number(event.target.value))}
            >
              {capabilities.map((item, index) => (
                <option key={item.kind} value={index}>
                  {item.kind === 'setOnOff' ? 'On / off' : `Setpoint (${item.unit})`}
                </option>
              ))}
            </select>
          </label>
        )}
        {draft.intent.kind === 'setOnOff' ? (
          <label>
            <span>Desired state</span>
            <select
              aria-label="Desired state"
              value={draft.intent.value ? 'on' : 'off'}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  clientRequestId: crypto.randomUUID(),
                  requestedAt: null,
                  intent: { kind: 'setOnOff', value: event.target.value === 'on' },
                });
                setSubmissionUncertain(false);
              }}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
        ) : capability.kind === 'setSetpoint' && (
          <label>
            <span>Desired setpoint ({capability.unit})</span>
            <input
              aria-label="Desired setpoint"
              type="number"
              min={capability.minimum}
              max={capability.maximum}
              step={capability.step}
              value={draft.intent.value}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  clientRequestId: crypto.randomUUID(),
                  requestedAt: null,
                  intent: { kind: 'setSetpoint', value: event.currentTarget.valueAsNumber },
                });
                setSubmissionUncertain(false);
              }}
            />
          </label>
        )}
        <div className="command-controls__separation">
          <span>Draft desired</span><strong>{formatCommandIntent(draft.intent, unit)}</strong>
          <span>Actual telemetry</span><strong>{actualValue(draft.intent, telemetry)}</strong>
        </div>
        <button type="button" onClick={requestSubmission} disabled={submitting}>
          {submitting
            ? 'Submitting…'
            : submissionUncertain
              ? 'Retry same command'
              : draft.requiresConfirmation ? 'Review command' : 'Send command'}
        </button>
      </div>
      {connectionStatus !== 'live' && (
        <p className="command-controls__transport" role="status">
          Realtime unavailable. HTTP submission remains explicit; accepted commands use status polling.
        </p>
      )}
      {error && <p className="command-controls__error" role="alert">{error}</p>}
      {orderedCommands.length > 0 && (
        <section className="command-history" aria-label="Recent commands">
          {orderedCommands.map((command) => {
            const commandCapability = capabilities.find((item) => item.kind === command.intent.kind);
            return (
              <div key={command.id} className={`command-history__item command-history__item--${command.state}`}>
                <span>Desired: {formatCommandIntent(
                  command.intent,
                  commandCapability?.kind === 'setSetpoint' ? commandCapability.unit : undefined,
                )}</span>
                <strong>Backend: {command.state}</strong>
                <small>Actual: {actualValue(command.intent, telemetry)}</small>
                <time dateTime={commandTimestamp(command)}>
                  {new Date(commandTimestamp(command)).toLocaleTimeString()}
                </time>
                {command.failure && <small>{command.failure.message}</small>}
              </div>
            );
          })}
        </section>
      )}
      {confirmationOpen && (
        <div className="command-confirmation" role="dialog" aria-modal="true" aria-labelledby="command-confirmation-title">
          <div>
            <p>CONFIRM CONTROL ACTION</p>
            <h3 id="command-confirmation-title">Potentially critical command</h3>
            <span>Send {formatCommandIntent(draft.intent, unit)} to {device.name}?</span>
            <small>Backend acceptance and actual telemetry will be displayed separately.</small>
            <div>
              <button type="button" onClick={() => setConfirmationOpen(false)} disabled={submitting}>Cancel</button>
              <button type="button" onClick={() => void submit(true)} disabled={submitting}>Confirm and send</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
