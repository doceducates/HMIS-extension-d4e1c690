/**
 * Radiology Controller
 */
const path = require('path');
const fs = require('fs');
const radiologyService = require('./radiology.service');
const { sendSuccess, sendError } = require('../../utils/response');

class RadiologyController {
    async getWorklist(req, res, next) {
        try {
            const list = await radiologyService.getWorklist(req.hmisCredentials);
            return sendSuccess(res, list, 'Proceeded patients worklist retrieved');
        } catch (err) {
            next(err);
        }
    }

    async searchPatient(req, res, next) {
        try {
            const mrn = req.query.mrn;
            const accession = req.query.accession;
            if (!mrn && !accession) {
                return sendError(res, 'Provide mrn or accession query parameter.', 400);
            }
            const data = await radiologyService.searchPatient(req.hmisCredentials, { mrn, accession });
            return sendSuccess(res, data, 'Patient search completed');
        } catch (err) {
            next(err);
        }
    }

    async trackReport(req, res, next) {
        try {
            const mrn = req.query.mrn;
            const accession = req.query.accession;
            if (!mrn && !accession) {
                return sendError(res, 'Provide mrn or accession query parameter.', 400);
            }
            const data = await radiologyService.trackReport(req.hmisCredentials, { mrn, accession });
            return sendSuccess(res, data, 'Report milestone tracking retrieved');
        } catch (err) {
            next(err);
        }
    }

    async saveDraft(req, res, next) {
        try {
            const result = await radiologyService.saveDraft(req.hmisCredentials, req.body);
            return sendSuccess(res, result, 'Radiology report draft successfully saved in HMIS');
        } catch (err) {
            next(err);
        }
    }

    getScreenshot(req, res) {
        const filename = path.basename(req.params.filename);
        const filePath = path.join(radiologyService.auditDir, filename);
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'image/png');
            return fs.createReadStream(filePath).pipe(res);
        }
        return sendError(res, 'Screenshot not found.', 404);
    }
}

module.exports = new RadiologyController();
