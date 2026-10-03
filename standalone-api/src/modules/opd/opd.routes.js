/**
 * OPD Routes
 */
const express = require('express');
const opdController = require('./opd.controller');

const router = express.Router();

router.get('/queue', (req, res, next) => opdController.getQueue(req, res, next));
router.post('/process', (req, res, next) => opdController.processToken(req, res, next));

module.exports = router;
