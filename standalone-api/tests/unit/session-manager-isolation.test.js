const { describe, it } = require('node:test');
const assert = require('node:assert');
const sessionManager = require('../../src/core/session-manager');

describe('Multi-Tenant Session Manager Isolation Tests', () => {
    it('should generate distinct keys for different user accounts', () => {
        const key1 = sessionManager.getKey('dr_ali', '19');
        const key2 = sessionManager.getKey('dr_usman', '19');
        const key3 = sessionManager.getKey('dr_ali', '18');

        assert.notStrictEqual(key1, key2);
        assert.notStrictEqual(key1, key3);
        assert.strictEqual(key1, 'dr_ali:19');
    });

    it('should handle session list and cleanup gracefully', async () => {
        const list = sessionManager.listSessions();
        assert.ok(Array.isArray(list));
        const closed = await sessionManager.closeSession('non_existent:19');
        assert.strictEqual(closed, false);
    });
});
