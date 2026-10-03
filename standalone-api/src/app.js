/**
 * Express Application Configuration
 */
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger');
const safetyMiddleware = require('./middleware/safety.middleware');
const authMiddleware = require('./middleware/auth.middleware');
const errorMiddleware = require('./middleware/error.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const radiologyRoutes = require('./modules/radiology/radiology.routes');
const opdRoutes = require('./modules/opd/opd.routes');
const sessionManager = require('./core/session-manager');

const app = express();

// Standard middleware
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-hmis-username, x-hmis-password, x-hmis-hospital-id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// Interactive Swagger UI Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Safety and Auth Middlewares
app.use(safetyMiddleware);
app.use(authMiddleware);

// Health check
app.get(['/api/status', '/health'], (req, res) => {
    res.json({
        status: 'online',
        safetyMode: 'STRICT_DRAFT_ONLY',
        activeSessions: sessionManager.listSessions().length,
        docs: '/api/docs'
    });
});

// Mount Feature Routers
app.use('/api/auth', authRoutes);
app.use('/api/radiology', radiologyRoutes);
app.use('/api/opd', opdRoutes);

// Error Shielding
app.use(errorMiddleware);

module.exports = app;
