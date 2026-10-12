const assert = require('assert');
const http = require('http');
const app = require('../src/index');

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Running server tests on ${baseUrl}...`);

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
    const healthJson = await healthRes.json();
    assert.strictEqual(healthJson.status, 'ok');
    console.log('✓ Health check passed');

    // 2. Reject missing body
    const emptyRes = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(emptyRes.status, 400, 'Empty body should return 400');
    console.log('✓ Rejection of empty body passed (400)');

    // 3. Reject malformed / command injection URL
    const malformedRes = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://evil.com/repo; rm -rf /' })
    });
    assert.strictEqual(malformedRes.status, 400, 'Malformed URL should return 400');
    console.log('✓ Rejection of malformed URL passed (400)');

    // 4. Non-existent GitHub repository (422)
    const notFoundRes = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/nonexistent-owner-abc1234/nonexistent-repo-xyz987' })
    });
    assert.strictEqual(notFoundRes.status, 422, 'Non-existent repo should return 422');
    console.log('✓ Non-existent repo clone failure passed (422)');

    // 5. Real GitHub repository clone & analysis test (200)
    console.log('Cloning real repo https://github.com/nikhilvirdi/Cockpit...');
    const realRes = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/nikhilvirdi/Cockpit' })
    });
    assert.strictEqual(realRes.status, 200, `Real repo should return 200, got ${realRes.status}`);
    const realData = await realRes.json();
    assert.ok(Array.isArray(realData.nodes), 'Response should contain nodes array');
    assert.ok(Array.isArray(realData.edges), 'Response should contain edges array');
    assert.ok(realData.analysis, 'Response should contain analysis object');
    assert.ok(realData.nodes.length > 0, 'Real repo should have discovered nodes');
    console.log(`✓ Real repo analyzed successfully: ${realData.nodes.length} nodes, ${realData.edges.length} edges (200)`);

    console.log('\nAll server unit tests passed successfully! ✓');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
