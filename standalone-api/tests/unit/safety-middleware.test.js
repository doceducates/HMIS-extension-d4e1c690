const { describe, it } = require('node:test');
const assert = require('node:assert');
const safetyMiddleware = require('../../src/middleware/safety.middleware');

describe('Strict Safety Middleware Tests', () => {
    it('should strictly coerce action: submit to action: save', () => {
        const req = { body: { mrn: '19202653175835', action: 'submit' } };
        const res = {};
        let nextCalled = false;
        safetyMiddleware(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, true);
        assert.strictEqual(req.body.action, 'save', 'Action must be coerced to save');
    });

    it('should leave action: save unchanged', () => {
        const req = { body: { mrn: '19202653175835', action: 'save' } };
        const res = {};
        safetyMiddleware(req, res, () => {});
        assert.strictEqual(req.body.action, 'save');
    });
});
