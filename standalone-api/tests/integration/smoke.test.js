const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../../src/app');

describe('Server & Swagger Gateway Integration Smoke Tests', () => {
    it('should serve /health and Swagger UI at /api/docs', (t, done) => {
        const server = http.createServer(app);
        server.listen(8082, () => {
            http.get('http://localhost:8082/health', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const parsed = JSON.parse(data);
                    assert.strictEqual(parsed.status, 'online');
                    assert.strictEqual(parsed.safetyMode, 'STRICT_DRAFT_ONLY');

                    http.get('http://localhost:8082/api/docs/', (docsRes) => {
                        assert.strictEqual(docsRes.statusCode, 200);
                        server.close(done);
                    });
                });
            });
        });
    });
});
