const { describe, it } = require('node:test');
const assert = require('node:assert');
const { inferDateRangeFromAccession, clampDateRange } = require('../../src/utils/date-helper');

describe('Date Helper & Accession Inference Unit Tests', () => {
    it('should infer September 2026 for accession 192609005762', () => {
        const hint = inferDateRangeFromAccession('192609005762');
        assert.ok(hint);
        assert.strictEqual(hint.year, 2026);
        assert.strictEqual(hint.month, 9);
        assert.strictEqual(hint.startDate, '2026-09-01 00:00:00');
        assert.strictEqual(hint.endDate, '2026-09-28 23:59:59');
    });

    it('should clamp date ranges exceeding 30 days', () => {
        const clamped = clampDateRange('2026-01-01 00:00:00', '2026-03-01 23:59:59');
        const start = new Date(clamped.startDate);
        const end = new Date(clamped.endDate);
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
        assert.ok(diffDays <= 30, `Expected <= 30 days, got ${diffDays}`);
    });
});
