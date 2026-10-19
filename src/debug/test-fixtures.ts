import type { Capture, Observation } from './model';
export function observation(id = 'e1', tag = 'input'): Observation {
  return { id, scope: 'main', tag, attributes: {}, children: [], styles: {}, rect: { x: 10, y: 20, width: 200, height: 30 }, visible: true,
    control: { kind: 'text', disabled: false, readOnly: false, labels: ['First name'], value: 'Alex' } };
}
export function fixture(): Capture {
  return { schemaVersion: 1, id: 'fixture-capture', name: 'Example — page 2', extensionVersion: '0.1.0', page: {
    url: 'https://example.com/apply', title: 'Fictional application', capturedAt: '2026-10-18T10:00:00.000Z',
    viewport: { width: 1200, height: 800, scrollX: 0, scrollY: 50 }, tree: observation(), omissions: [], preserveValues: true,
  } };
}
