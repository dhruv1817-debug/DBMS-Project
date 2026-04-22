const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/db');
const ridesRoutes = require('./routes/rides');
const driversRoutes = require('./routes/drivers');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging for monitoring peak-hour load
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (duration > 500) {
            console.warn(`[SLOW] ${req.method} ${req.path} - ${duration}ms`);
        }
    });
    next();
});

// ============================================================
// STATIC FILES (Frontend)
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/rides', ridesRoutes);
app.use('/api/drivers', driversRoutes);

// Health check
app.get('/api/health', async (req, res) => {
    const dbOK = await testConnection();
    res.json({
        status: dbOK ? 'healthy' : 'unhealthy',
        database: dbOK ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// Root redirect to frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, async () => {
    const dbOK = await testConnection();
    console.log(`============================================`);
    console.log(`  Ride Sharing Matching DBMS Server`);
    console.log(`============================================`);
    console.log(`  Server running on http://localhost:${PORT}`);
    console.log(`  Database: ${dbOK ? 'CONNECTED' : 'FAILED - check .env config'}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`============================================`);
});

module.exports = app;
