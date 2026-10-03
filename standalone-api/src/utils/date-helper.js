/**
 * Date Helper for Punjab HMIS Accession Numbers and Range Queries
 */

/**
 * Infers date range from Accession number (e.g. 192609005762 -> Sep 2026)
 * Pattern: [HospitalID:2][Year:2][Month:2][Seq:6]
 */
function inferDateRangeFromAccession(accession) {
    if (!accession || typeof accession !== 'string') return null;
    const match = accession.trim().match(/^\d{2}(\d{2})(\d{2})\d+$/);
    if (!match) return null;

    const yy = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (mm < 1 || mm > 12) return null;

    const fullYear = 2000 + yy;
    const monthStr = String(mm).padStart(2, '0');
    
    // Day 1 to Day 28 (strictly < 30 days to satisfy HMIS validation)
    const startDate = `${fullYear}-${monthStr}-01 00:00:00`;
    const endDate = `${fullYear}-${monthStr}-28 23:59:59`;

    return { startDate, endDate, year: fullYear, month: mm };
}

/**
 * Validates and clamps a date range to HMIS's 30-day limit
 */
function clampDateRange(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    let end = new Date(endDateStr);
    const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 30) {
        end.setTime(start.getTime() + 29 * 24 * 60 * 60 * 1000);
        endDateStr = end.toISOString().split('T')[0] + ' 23:59:59';
    }

    return { startDate: startDateStr, endDate: endDateStr };
}

module.exports = {
    inferDateRangeFromAccession,
    clampDateRange
};
