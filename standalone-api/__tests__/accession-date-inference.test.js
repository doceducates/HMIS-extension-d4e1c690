const { describe, it } = require('node:test');
const assert = require('node:assert');
const { inferDateRangeFromAccession } = require('../radiology-scraper');

describe('HMIS Accession Number & Date Range Inference Tests', () => {
    it('should correctly infer September 2026 for accession 192609005762', () => {
        const hint = inferDateRangeFromAccession('192609005762');
        assert.ok(hint, 'Should return date hint object');
        assert.strictEqual(hint.year, 2026);
        assert.strictEqual(hint.month, 9);
        assert.strictEqual(hint.startDate, '2026-09-01 00:00:00');
        assert.strictEqual(hint.endDate, '2026-09-28 23:59:59');

        // Verify difference is strictly <= 30 days per HMIS portal rule
        const start = new Date(hint.startDate);
        const end = new Date(hint.endDate);
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
        assert.ok(diffDays <= 30, `Date range must be <= 30 days, got ${diffDays}`);
    });

    it('should correctly infer October 2026 for accession 192610000839', () => {
        const hint = inferDateRangeFromAccession('192610000839');
        assert.ok(hint);
        assert.strictEqual(hint.year, 2026);
        assert.strictEqual(hint.month, 10);
        assert.strictEqual(hint.startDate, '2026-10-01 00:00:00');
        assert.strictEqual(hint.endDate, '2026-10-28 23:59:59');
    });

    it('should return null for malformed or non-standard accessions', () => {
        assert.strictEqual(inferDateRangeFromAccession(''), null);
        assert.strictEqual(inferDateRangeFromAccession('ABC1234'), null);
        assert.strictEqual(inferDateRangeFromAccession(null), null);
        assert.strictEqual(inferDateRangeFromAccession('192699001234'), null); // Invalid month 99
    });
});
