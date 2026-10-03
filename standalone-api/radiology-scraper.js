/**
 * Radiology DOM Scraper & Parser Utility
 * Extracts patient records, investigations, and milestone tracking from HMIS tables.
 */

/**
 * Parses the Proceeded Patients worklist table
 * @returns {Array} List of patient encounters with nested investigations
 */
function extractWorklistRecords() {
    const rows = document.querySelectorAll('.right_col table tbody tr, table tbody tr');
    const records = [];

    rows.forEach(row => {
        const text = row.innerText || '';
        if (!text || text.includes('No matching records') || text.includes('Loading')) return;

        // Parse Demographics from Patient Information cell
        const mrnMatch = text.match(/MRN:\s*(\d+)/i);
        const nameMatch = text.match(/Name:\s*([^\n\r]+)/i);
        const cnicMatch = text.match(/CNIC:\s*([^\n\r]+)/i);
        const genderMatch = text.match(/Gender:\s*([^\n\r]+)/i);

        // Parse Doctor & Department
        const doctorMatch = text.match(/Doctor:\s*([^\n\r]+)/i);
        const deptMatch = text.match(/Department:\s*([^\n\r]+)/i);
        const wardMatch = text.match(/Ward\s*:\s*([^\n\r]+)/i);

        // Parse Modality & Room
        let room = '';
        let modality = '';
        if (text.includes('CT Scan Room') || text.includes('CT-Scan')) {
            room = 'CT Scan Room';
            modality = 'CT';
        } else if (text.includes('MRI ROOM') || text.includes('MRI')) {
            room = 'MRI Room';
            modality = 'MRI';
        } else if (text.includes('X Ray') || text.includes('X-Ray')) {
            room = 'X-Ray Room';
            modality = 'X-Ray';
        }

        // Parse Investigations in this row
        const investigations = [];
        const addResultButtons = row.querySelectorAll('a[wire\\:click*="addSampleResult"], button[wire\\:click*="addSampleResult"]');
        const accessionLinks = row.querySelectorAll('a[href*="accession="]');

        accessionLinks.forEach((accLink, idx) => {
            const accHref = accLink.getAttribute('href') || '';
            const accMatch = accHref.match(/accession=(\d+)/i) || accLink.innerText.match(/Accession#?\s*(\d+)/i);
            const invIdMatch = accHref.match(/patient_investigation_id=(\d+)/i);
            
            const studyTitle = accLink.closest('td')?.innerText?.split('\n')?.[0]?.trim() || 'Radiology Study';
            const relatedBtn = addResultButtons[idx] || null;

            if (accMatch) {
                investigations.push({
                    accession: accMatch[1],
                    patientInvestigationId: invIdMatch ? invIdMatch[1] : (relatedBtn?.getAttribute('wire:click')?.match(/\d+/)?.[0] || ''),
                    studyTitle: studyTitle,
                    canAddResult: !!relatedBtn,
                    status: relatedBtn ? 'AWAITING_REPORT' : 'COMPLETED_OR_PROCESSING'
                });
            }
        });

        if (mrnMatch || investigations.length > 0) {
            records.push({
                mrn: mrnMatch ? mrnMatch[1] : '',
                patientName: nameMatch ? nameMatch[1].trim() : '',
                cnic: cnicMatch ? cnicMatch[1].trim() : '',
                gender: genderMatch ? genderMatch[1].trim() : '',
                doctor: doctorMatch ? doctorMatch[1].trim() : '',
                department: deptMatch ? deptMatch[1].trim() : '',
                ward: wardMatch ? wardMatch[1].trim() : '',
                room,
                modality,
                investigations
            });
        }
    });

    return records;
}

/**
 * Parses the Tracking List table milestones
 * @returns {Array} List of patient investigation tracking records
 */
function extractTrackingMilestones() {
    const rows = document.querySelectorAll('.right_col table tbody tr, table tbody tr');
    const records = [];

    rows.forEach(row => {
        const text = row.innerText || '';
        if (!text || text.includes('No matching records')) return;

        const mrnMatch = text.match(/MRN:\s*(\d+)/i);
        const nameMatch = text.match(/Name:\s*([^\n\r]+)/i);
        const accessionMatch = text.match(/Accession#?\s*(\d+)/i);

        // Milestone pattern detection
        const milestones = {
            order: text.match(/Order:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            reception: text.match(/Reception[s]?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            acknowledged: text.match(/Acknowledged?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            performed: text.match(/Performed?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            verified: text.match(/Verified?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            published: text.match(/Published?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            rejected: text.match(/Rejected?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null
        };

        // Determine macro status
        let status = 'UNKNOWN';
        if (milestones.published) status = 'PUBLISHED';
        else if (milestones.verified) status = 'VERIFIED';
        else if (milestones.performed) status = 'PERFORMED_AWAITING_REPORT';
        else if (milestones.rejected) status = 'REJECTED';
        else if (milestones.acknowledged) status = 'ACKNOWLEDGED';
        else if (milestones.order) status = 'ORDERED';

        if (accessionMatch || mrnMatch) {
            records.push({
                mrn: mrnMatch ? mrnMatch[1] : '',
                patientName: nameMatch ? nameMatch[1].trim() : '',
                accession: accessionMatch ? accessionMatch[1] : '',
                status,
                milestones,
                rawText: text.substring(0, 300)
            });
        }
    });

    return records;
}

/**
 * Inactive/historical search date range inference from Accession number
 * Format: [HospitalID:2][Year:2][Month:2][Seq:6] e.g. 192609005762
 * 19 = Hospital, 26 = 2026, 09 = September
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
    
    // First day of that month
    const startDate = `${fullYear}-${monthStr}-01 00:00:00`;
    // 28 days later to guarantee strictly < 30 days window
    const endDate = `${fullYear}-${monthStr}-28 23:59:59`;

    return { startDate, endDate, year: fullYear, month: mm };
}

module.exports = {
    extractWorklistRecords,
    extractTrackingMilestones,
    inferDateRangeFromAccession
};
