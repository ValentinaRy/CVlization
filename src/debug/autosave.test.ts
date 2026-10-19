import { describe, expect, it, vi } from 'vitest';
import { Autosave } from './autosave';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
describe('immediate annotation persistence', () => {
  it('serializes rapid changes and keeps the newest selection after a slow write', async () => {
    const writes: string[] = []; let release!: () => void;
    const writer = new Autosave(async (value: { name: string }) => {
      writes.push(value.name);
      if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; });
    }, vi.fn());
    const value = { name: 'Name' }; writer.update(value); value.name = 'mutated outside';
    writer.update({ name: 'Surname' }); writer.update({ name: 'Name+Surname' });
    expect(writer.state).toBe('saving'); expect(writer.dirty).toBe(true);
    expect(writes).toEqual(['Name']);
    release(); await tick();
    expect(writes).toEqual(['Name', 'Name+Surname']);
    expect(writer.state).toBe('saved'); expect(writer.dirty).toBe(false);
  });
  it('keeps failed labels for retry and never reports them saved early', async () => {
    let fail = true; const writes: string[] = [];
    const writer = new Autosave(async (value: string) => { if (fail) throw new Error('Disk full'); writes.push(value); }, vi.fn());
    writer.update('Education 3'); await tick();
    expect(writer.state).toBe('error'); expect(writer.dirty).toBe(true);
    fail = false; await writer.flush();
    expect(writes).toEqual(['Education 3']); expect(writer.state).toBe('saved'); expect(writer.dirty).toBe(false);
  });
  it('persists clearing an annotation as an edit', async () => {
    const write = vi.fn(async (_labels: Record<string, string>) => {});
    const writer = new Autosave(write, vi.fn());
    writer.update({ e1: 'Name' }); await tick(); writer.update({}); await tick();
    expect(write.mock.calls.map(call => call[0])).toEqual([{ e1: 'Name' }, {}]);
  });
});
