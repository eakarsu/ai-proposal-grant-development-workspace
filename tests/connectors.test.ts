import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredConnectors, connectorRequest, type Connector } from '../src/lib/connectors';
const connector: Connector = {id:'fixture',label:'Fixture',endpoint:'https://fixture.invalid',actions:['submit'],schemaVersion:'1'};
test('connector execution requires a matching receipt and disallows redirects', async () => {
  const original = globalThis.fetch;
  let payload: unknown = {status:'completed',schemaVersion:'1',receiptId:'receipt',idempotencyKey:'key'};
  globalThis.fetch = async (_url, options) => {
    assert.equal(options?.redirect,'error');
    assert.equal((options?.headers as Record<string,string>)['Idempotency-Key'],'key');
    return Response.json(payload);
  };
  try {
    assert.equal((await connectorRequest(connector,'execute',{action:'submit'},'key')).receiptId,'receipt');
    for (const invalid of [
      {status:'completed',schemaVersion:'1',receiptId:'receipt',idempotencyKey:'different'},
      {status:'pending',schemaVersion:'1',receiptId:'receipt',idempotencyKey:'key'},
      {status:'completed',schemaVersion:'1',idempotencyKey:'key'},
      {status:'completed',schemaVersion:'2',receiptId:'receipt',idempotencyKey:'key'},
    ]) { payload=invalid; await assert.rejects(connectorRequest(connector,'execute',{},'key')); }
  } finally { globalThis.fetch=original; }
});
test('connector configuration never accepts insecure or credential-bearing URLs', () => {
  const old=process.env.DOMAIN_CONNECTORS_JSON;
  try {
    for (const endpoint of ['http://fixture.invalid','https://user:secret@fixture.invalid','https://fixture.invalid?token=secret']) {
      process.env.DOMAIN_CONNECTORS_JSON=JSON.stringify([{...connector,endpoint}]);
      assert.throws(configuredConnectors);
    }
    delete process.env.DOMAIN_CONNECTORS_JSON;
    assert.deepEqual(configuredConnectors(),[]);
  } finally { if (old===undefined) delete process.env.DOMAIN_CONNECTORS_JSON; else process.env.DOMAIN_CONNECTORS_JSON=old; }
});
