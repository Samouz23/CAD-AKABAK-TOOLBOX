import fs from 'node:fs';

const backendPath = new URL('../src/js/bem/bemDomainBackend.js', import.meta.url);
const backendSource = fs.readFileSync(backendPath, 'utf8');

Object.defineProperty(globalThis, 'navigator', {
  value: { hardwareConcurrency: 32 },
  configurable: true,
});
globalThis.fetch = async () => ({ ok: true, text: async () => '' });
globalThis.URL.createObjectURL = () => 'blob:bem-domain-worker';

class FakeWorker {
  static instances = [];
  static hang = false;

  constructor() {
    this.listeners = { message: new Set(), error: new Set() };
    this.terminated = false;
    this.frequencies = [];
    FakeWorker.instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners[type].add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type].delete(listener);
  }

  postMessage(message) {
    this.frequencies = message.opts.freqs.slice();
    if (FakeWorker.hang) return;
    queueMicrotask(() => {
      this.emit({ type: 'progress', id: message.id, ev: {
        phase: 'meshReady',
        meshInfo: { elementCount: 1, unknowns: 1, fMaxValid_Hz: 20000 },
      }});
      this.emit({ type: 'progress', id: message.id, ev: { phase: 'prepare', subProgress: 1 } });
      for (const frequency of this.frequencies) {
        this.emit({ type: 'progress', id: message.id, ev: {
          phase: 'freqDone', freq: frequency, elapsed_ms: 1,
        }});
      }
      const rows = this.frequencies.map(f => ({ f }));
      this.emit({ type: 'done', id: message.id, result: {
        freqs: this.frequencies,
        polarH: rows,
        polarV: rows,
        power: rows,
        onAxis: rows,
        meshInfo: { elementCount: 1, unknowns: 1, fMaxValid_Hz: 20000 },
        prepareDiagnostics: [],
        aborted: false,
      }});
    });
  }

  emit(data) {
    for (const listener of this.listeners.message) listener({ data });
  }

  terminate() {
    this.terminated = true;
  }
}

globalThis.Worker = FakeWorker;

const backendUrl = `data:text/javascript;base64,${Buffer.from(backendSource).toString('base64')}`;
const { solveBemDomains, abortBemDomains } = await import(backendUrl);
const frequencies = Array.from({ length: 40 }, (_, index) => 100 + index * 100);
const msh = '$Elements\n0\n$EndElements\n';
const result = await solveBemDomains(msh, { subdomains: [], interfaces: [] }, { frequencies, freqs: frequencies });

if (result.workers !== 30) throw new Error(`Expected 30 workers, got ${result.workers}`);
if (FakeWorker.instances.length !== 30) throw new Error(`Expected 30 worker instances, got ${FakeWorker.instances.length}`);
if (result.freqs.join(',') !== frequencies.join(',')) throw new Error('Merged frequencies are not sorted correctly');
const dispatched = FakeWorker.instances.flatMap(worker => worker.frequencies).sort((a, b) => a - b);
if (dispatched.join(',') !== frequencies.join(',')) throw new Error('A frequency was duplicated or omitted');

FakeWorker.hang = true;
const abortPromise = solveBemDomains(msh, { subdomains: [], interfaces: [] }, { freqs: frequencies.slice(0, 4) });
await new Promise(resolve => setImmediate(resolve));
abortBemDomains();
await abortPromise.then(
  () => { throw new Error('Abort unexpectedly resolved'); },
  error => {
    if (!/aborted/i.test(error.message)) throw error;
  },
);
const abortWorkers = FakeWorker.instances.slice(30);
if (!abortWorkers.length || abortWorkers.some(worker => !worker.terminated)) {
  throw new Error('Abort did not terminate every active worker');
}

console.log('BEM domain worker pool: PASS (30 workers, ordered merge, immediate abort)');