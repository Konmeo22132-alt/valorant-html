// Queue/visibility regressions without WebGL or loading the complete map.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const B = require('babylonjs');
const root = path.resolve(__dirname, '../val-strike-html');
const production = JSON.parse(fs.readFileSync(path.join(root, 'game/config/performance.json')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup(overrides = {}, request) {
  const calls = [], warnings = [], document = { hidden: false }, window = { __gamePlaying: false };
  const context = vm.createContext({ BABYLON: { ...B, Texture: class extends B.Texture {
    constructor(url, scene, noMip, invertY, sampling, ready) { super(null, scene); queueMicrotask(ready); }
  } }, console: { warn: (...args) => warnings.push(args) }, performance, setTimeout, clearTimeout, AbortController, document, window,
    fetch: async (url, options) => { calls.push(url); return request ? request(url, options, calls, document) : { ok: true, arrayBuffer: async () => new ArrayBuffer(32) }; } });
  vm.runInContext(fs.readFileSync(path.join(root, 'game/map-streamer.js'), 'utf8') + '\nthis.MapStreamer = MapStreamer;', context);
  const engine = new B.NullEngine(), scene = new B.Scene(engine);
  const chunks = Array.from({ length: 203 }, (_, i) => ({ file: i < 3 ? 'near_' + i : 'far_' + i,
    min: [-1, 0, i < 3 ? -1 : 50 + i], max: [1, 2, i < 3 ? 1 : 51 + i], bytes: 64, triangles: 1 }));
  const stream = new context.MapStreamer(scene, '/', { material: {}, palette: 'palette.png', chunks, triangles: chunks.length },
    { ...production, mapInitialTimeout: 500, mapRequestTimeout: 50, mapRetryDelay: 10, ...overrides });
  stream.createMesh = () => ({ metadata: { triangles: 1 }, dispose() {} });
  return { stream, calls, document, warnings, window, scene,
    prime: () => stream.prime(new B.Vector3(0, 1.7, 0), 0, 1.4),
    dispose: () => { stream.dispose(); scene.dispose(); engine.dispose(); } };
}
(async () => {
  let test = setup();
  try {
    await test.prime();
    assert.equal(test.calls.length, 3);
    assert.ok(test.stream.entries.filter(e => e.wanted).length > 100);
    await sleep(20); assert.equal(test.calls.length, 3, 'Distant geometry must wait for gameplay');
    assert.equal(test.stream.resident.size, 3);
    console.log('PASS spawn readiness waits for nearby chunks only; distant requests stay deferred');
  } finally { test.dispose(); }

  test = setup({ mapInitialTimeout: 80 });
  try {
    test.document.hidden = true;
    const loading = test.prime();
    await sleep(160); assert.equal(test.calls.length, 0);
    test.document.hidden = false; await loading;
    assert.equal(test.stream.resident.size, 3);
    console.log('PASS hidden startup pauses its deadline and restarts without a render observer');
  } finally { test.dispose(); }

  test = setup({ mapInitialTimeout: 80 }, async (url, options, calls, document) => {
    if (calls.length === 1) document.hidden = true;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(32) };
  });
  try {
    const loading = test.prime();
    await sleep(160); assert.equal(test.calls.length, 1);
    test.document.hidden = false; await loading;
    assert.equal(test.calls.length, 3);
    console.log('PASS hiding after the first chunk does not strand the remaining queue');
  } finally { test.dispose(); }

  test = setup({}, async (url, options, calls) => {
    if (calls.length === 1) throw new Error('Transient network failure');
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(32) };
  });
  try {
    await test.prime(); assert.equal(test.calls.length, 4);
    assert.equal(test.warnings.length, 1);
    console.log('PASS transient request failures retry during initialization');
  } finally { test.dispose(); }

  test = setup({}, (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { const error = new Error('Aborted'); error.name = 'AbortError'; reject(error); }, { once: true });
  }));
  try {
    await assert.rejects(test.prime(), /Initial map chunk failed: near_0 \(Request timed out\)/);
    assert.equal(test.calls.filter(url => url === '/near_0').length, 3);
    console.log('PASS stalled requests abort, retry within limits and report the failing asset');
  } finally { test.dispose(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
