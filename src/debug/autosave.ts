/** Serialize writes, coalesce newer edits, and retain the latest draft after failures. */
export class Autosave<T> {
  state: 'saved' | 'saving' | 'error' = 'saved';
  error: unknown;
  private pending?: { version: number; value: T };
  private version = 0;
  private savedVersion = 0;
  private running = false;
  constructor(private write: (value: T) => Promise<void>, private changed: () => void) {}
  get dirty() { return this.version !== this.savedVersion; }
  update(value: T) {
    this.pending = { version: ++this.version, value: structuredClone(value) };
    void this.flush();
  }
  async flush() {
    if (this.running || !this.pending) return;
    this.running = true;
    this.state = 'saving'; this.error = undefined; this.changed();
    try {
      while (this.pending) {
        const current = this.pending;
        await this.write(current.value);
        this.savedVersion = current.version;
        if (this.pending.version === current.version) this.pending = undefined;
      }
      this.state = 'saved';
    } catch (error) { this.error = error; this.state = 'error'; }
    finally { this.running = false; this.changed(); }
  }
}
