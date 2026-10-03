/**
 * OPD Controller
 */
const opdService = require('./opd.service');
const { sendSuccess } = require('../../utils/response');

class OpdController {
    async getQueue(req, res, next) {
        try {
            const queue = await opdService.getQueue(req.hmisCredentials);
            return sendSuccess(res, queue, 'OPD token queue retrieved');
        } catch (err) {
            next(err);
        }
    }

    async processToken(req, res, next) {
        try {
            const patientId = req.body?.patientId;
            const result = await opdService.processPatientToken(req.hmisCredentials, patientId);
            return sendSuccess(res, result, `Patient token ${patientId} processed`);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new OpdController();
