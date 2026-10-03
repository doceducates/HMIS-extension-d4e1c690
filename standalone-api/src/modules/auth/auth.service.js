/**
 * Auth Service
 */
const sessionManager = require('../../core/session-manager');

class AuthService {
    async login(credentials) {
        const session = await sessionManager.getSession(credentials);
        return {
            sessionId: session.id,
            username: session.username,
            hospitalId: session.hospitalId,
            isLoggedIn: session.isLoggedIn
        };
    }

    async logout(sessionId) {
        return await sessionManager.closeSession(sessionId);
    }

    listActiveSessions() {
        return sessionManager.listSessions();
    }
}

module.exports = new AuthService();
