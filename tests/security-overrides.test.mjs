import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

const require = createRequire(import.meta.url);
const runtimeRequire = createRequire(require.resolve('miniflare'));

test('patched Miniflare HTTP client preserves synthetic JSON requests', async () => {
  const {request, Agent} = runtimeRequire('undici');
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({id:'SIM-001', method:req.method}));
  });
  const agent = new Agent();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await request(`http://127.0.0.1:${server.address().port}`, {dispatcher:agent});
    assert.equal(response.statusCode, 200);
    assert.deepEqual(await response.body.json(), {id:'SIM-001',method:'GET'});
  } finally {
    await agent.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('patched Miniflare executes an isolated synthetic Worker', async () => {
  const runtime = new Miniflare(convertV4MiniflareOptions({modules:true, compatibilityDate:'2026-10-19',
    script:'export default {async fetch(request) {return Response.json({method:request.method, data:await request.json()})}}'}));
  try {
    const response = await runtime.dispatchFetch('https://simulation.invalid', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:'SIM-001'})});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {method:'POST',data:{id:'SIM-001'}});
  } finally { await runtime.dispose(); }
});
