const assert = require('assert');
const http = require('http');
const AdmZip = require('adm-zip');
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

    // 2. Reject missing body on /api/analyze
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

    // 5. Upload endpoint: reject missing file
    const noFileRes = await fetch(`${baseUrl}/api/analyze-upload`, {
      method: 'POST',
      body: new FormData()
    });
    assert.strictEqual(noFileRes.status, 400, 'Upload without file should return 400');
    console.log('✓ Upload without file rejected (400)');

    // 6. Upload endpoint: reject invalid zip buffer
    const badFormData = new FormData();
    badFormData.append('bundle', new Blob(['not a real zip'], { type: 'application/zip' }), 'test.zip');
    const badZipRes = await fetch(`${baseUrl}/api/analyze-upload`, {
      method: 'POST',
      body: badFormData
    });
    assert.strictEqual(badZipRes.status, 400, 'Corrupt zip buffer should return 400');
    console.log('✓ Corrupt zip buffer rejected (400)');

    // 7. Upload endpoint: reject zip-slip path traversal attempt
    const slipZip = new AdmZip();
    slipZip.addFile('dummy.js', Buffer.from('console.log("evil");'));
    slipZip.getEntries()[0].entryName = '../../evil.js';
    const slipBuffer = slipZip.toBuffer();
    const slipFormData = new FormData();
    slipFormData.append('bundle', new Blob([slipBuffer], { type: 'application/zip' }), 'slip.zip');
    const slipRes = await fetch(`${baseUrl}/api/analyze-upload`, {
      method: 'POST',
      body: slipFormData
    });
    assert.strictEqual(slipRes.status, 400, 'Zip-slip attempt should be rejected with 400');
    console.log('✓ Zip-slip path traversal attempt rejected (400)');

    // 8. Upload endpoint: valid zip upload of a project
    const validZip = new AdmZip();
    validZip.addFile('package.json', Buffer.from(JSON.stringify({ name: 'uploaded-app', main: 'src/index.ts' })));
    validZip.addFile('tsconfig.json', Buffer.from(JSON.stringify({ compilerOptions: { baseUrl: '.' } })));
    validZip.addFile('src/index.ts', Buffer.from("import { util } from './util'; console.log(util);"));
    validZip.addFile('src/util.ts', Buffer.from("export const util = 'hello from upload';"));
    const validBuffer = validZip.toBuffer();

    const validFormData = new FormData();
    validFormData.append('bundle', new Blob([validBuffer], { type: 'application/zip' }), 'project.zip');

    const validUploadRes = await fetch(`${baseUrl}/api/analyze-upload`, {
      method: 'POST',
      body: validFormData
    });
    assert.strictEqual(validUploadRes.status, 200, `Valid zip upload should return 200, got ${validUploadRes.status}`);
    const validData = await validUploadRes.json();
    assert.ok(Array.isArray(validData.nodes), 'Uploaded graph must have nodes');
    assert.ok(Array.isArray(validData.edges), 'Uploaded graph must have edges');
    assert.ok(validData.analysis, 'Uploaded graph must have analysis');
    assert.strictEqual(validData.nodes.length, 2, 'Should find 2 nodes: src/index.ts and src/util.ts');
    assert.strictEqual(validData.edges.length, 1, 'Should find 1 edge: src/index.ts -> src/util.ts');
    console.log('✓ Valid zip upload analyzed successfully (200: 2 nodes, 1 edge)');

    // 9. Upload endpoint: reject zip exceeding file count cap (413)
    const tooManyFilesZip = new AdmZip();
    for (let i = 0; i <= 5000; i++) {
      tooManyFilesZip.addFile(`file_${i}.ts`, Buffer.from(''));
    }
    const tooManyBuffer = tooManyFilesZip.toBuffer();
    const tooManyFormData = new FormData();
    tooManyFormData.append('bundle', new Blob([tooManyBuffer], { type: 'application/zip' }), 'too-many.zip');
    const tooManyRes = await fetch(`${baseUrl}/api/analyze-upload`, {
      method: 'POST',
      body: tooManyFormData
    });
    assert.strictEqual(tooManyRes.status, 413, 'Zip with >5000 files should be rejected with 413');
    const tooManyJson = await tooManyRes.json();
    assert.ok(tooManyJson.error.includes('too many files'), 'Error message should mention too many files');
    console.log('✓ File count limit cap rejected cleanly (413)');

    // 10. Upload endpoint: reject file exceeding size cap (413)
    // Spawn temporary app instance with lower size cap to test multer rejection cleanly
    const savedLimit = process.env.MAX_UPLOAD_SIZE;
    process.env.MAX_UPLOAD_SIZE = '1024'; // 1KB limit
    delete require.cache[require.resolve('../src/index')];
    const lowCapApp = require('../src/index');
    const lowCapServer = http.createServer(lowCapApp);
    await new Promise(res => lowCapServer.listen(0, res));
    const lowCapUrl = `http://127.0.0.1:${lowCapServer.address().port}`;

    try {
      const oversizedForm = new FormData();
      oversizedForm.append('bundle', new Blob([Buffer.alloc(2048, 'x')], { type: 'application/zip' }), 'big.zip');
      const oversizedRes = await fetch(`${lowCapUrl}/api/analyze-upload`, {
        method: 'POST',
        body: oversizedForm
      });
      assert.strictEqual(oversizedRes.status, 413, 'Oversized file should be rejected with 413');
      const oversizedJson = await oversizedRes.json();
      assert.ok(oversizedJson.error.includes('exceeds the maximum size limit'), 'Error message should mention size limit');
      console.log('✓ File size limit cap rejected cleanly (413)');
    } finally {
      lowCapServer.close();
      if (savedLimit !== undefined) {
        process.env.MAX_UPLOAD_SIZE = savedLimit;
      } else {
        delete process.env.MAX_UPLOAD_SIZE;
      }
      delete require.cache[require.resolve('../src/index')];
    }

    console.log('\nAll server unit tests passed successfully! ✓');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
