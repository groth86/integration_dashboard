import type { IncomingRecord } from '../lib/records';

// A source event has the same shape as a record sent to POST /api/recordimport/fromflowgear.
export type RawEvent = IncomingRecord;

export interface MonitorSource {
  readonly name: string;
  fetchSince(since: Date | null): Promise<RawEvent[]>;
}
