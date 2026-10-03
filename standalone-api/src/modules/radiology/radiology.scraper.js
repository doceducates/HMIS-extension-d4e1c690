/**
 * Radiology DOM Scraper Utility
 */
function extractWorklistRecords() {
    const rows = document.querySelectorAll('.right_col table tbody tr, table tbody tr');
    const records = [];

    rows.forEach(row => {
        const text = row.innerText || '';
        if (!text || text.includes('No matching records') || text.includes('Loading')) return;

        const mrnMatch = text.match(/MRN:\s*(\d+)/i);
        const nameMatch = text.match(/Name:\s*([^\n\r]+)/i);
        const cnicMatch = text.match(/CNIC:\s*([^\n\r]+)/i);
        const genderMatch = text.match(/Gender:\s*([^\n\r]+)/i);
        const doctorMatch = text.match(/Doctor:\s*([^\n\r]+)/i);
        const deptMatch = text.match(/Department:\s*([^\n\r]+)/i);
        const wardMatch = text.match(/Ward\s*:\s*([^\n\r]+)/i);

        let room = text.includes('CT Scan Room') ? 'CT Scan Room' : (text.includes('MRI ROOM') ? 'MRI Room' : '');
        let modality = text.includes('CT-Scan') ? 'CT' : (text.includes('MRI') ? 'MRI' : (text.includes('X Ray') ? 'X-Ray' : ''));

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
                    studyTitle,
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

function extractTrackingMilestones() {
    const rows = document.querySelectorAll('.right_col table tbody tr, table tbody tr');
    const records = [];

    rows.forEach(row => {
        const text = row.innerText || '';
        if (!text || text.includes('No matching records')) return;

        const mrnMatch = text.match(/MRN:\s*(\d+)/i);
        const nameMatch = text.match(/Name:\s*([^\n\r]+)/i);
        const accessionMatch = text.match(/Accession#?\s*(\d+)/i);

        const milestones = {
            order: text.match(/Order:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            reception: text.match(/Reception[s]?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            acknowledged: text.match(/Acknowledged?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            performed: text.match(/Performed?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            verified: text.match(/Verified?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            published: text.match(/Published?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null,
            rejected: text.match(/Rejected?:?\s*([^\n\r]+)/i)?.[1]?.trim() || null
        };

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

module.exports = {
    extractWorklistRecords,
    extractTrackingMilestones
};
