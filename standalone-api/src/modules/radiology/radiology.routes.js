/**
 * Radiology Routes
 */
const express = require('express');
const radiologyController = require('./radiology.controller');

const router = express.Router();

router.get('/worklist', (req, res, next) => radiologyController.getWorklist(req, res, next));
router.get('/queue', (req, res, next) => radiologyController.getWorklist(req, res, next)); // alias
router.get('/patient', (req, res, next) => radiologyController.searchPatient(req, res, next));
router.get('/track', (req, res, next) => radiologyController.trackReport(req, res, next));
router.post('/draft', (req, res, next) => radiologyController.saveDraft(req, res, next));
router.post('/report', (req, res, next) => radiologyController.saveDraft(req, res, next)); // safe alias
router.get('/screenshot/:filename', (req, res) => radiologyController.getScreenshot(req, res));

module.exports = router;
