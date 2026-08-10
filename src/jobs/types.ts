export interface RawEvent {
  timestamp: string | Date;
  accountName?: string | null;
  businessUnit?: string | null;
  system?: string | null;
  direction?: string | null;
  integrationType: string;
  recordId?: string | null;
  status: string;
  response?: string | null;
}

export interface MonitorSource {
  readonly name: string;
  fetchSince(since: Date | null): Promise<RawEvent[]>;
}
