import type { MonitorSource, RawEvent } from '../types';

export class MockSource implements MonitorSource {
  readonly name = 'mock';

  async fetchSince(since: Date | null): Promise<RawEvent[]> {
    const anchor = since ? new Date(since.getTime() + 60_000) : new Date();
    const at = (offsetMin: number) =>
      new Date(anchor.getTime() + offsetMin * 60_000).toISOString();

    const events: RawEvent[] = [
      {
        timestamp: at(0),
        accountName: 'Aarke USA (Amazon)',
        businessUnit: 'Bergen Logistics',
        system: 'CloudX WMS',
        direction: 'In',
        integrationType: 'Inventory Update',
        recordId: 'A2001',
        status: 'Success',
        response: 'True',
      },
      {
        timestamp: at(1),
        accountName: 'Aarke USA (Amazon)',
        businessUnit: 'Bergen Logistics',
        system: 'CloudX WMS',
        direction: 'In',
        integrationType: 'Inventory Update',
        recordId: 'A2002',
        status: 'Success',
        response: 'True',
      },
      {
        timestamp: at(2),
        accountName: 'Aarke USA (Ecom)',
        businessUnit: 'Bergen Logistics',
        system: 'CloudX WMS',
        direction: 'Out',
        integrationType: 'Sales Order Fulfilment',
        recordId: '9900123456',
        status: 'Failed',
        response:
          '{"userErrors":[{"message":"Invalid fulfillment order line item quantity requested."}]}',
      },
    ];

    return events;
  }
}
