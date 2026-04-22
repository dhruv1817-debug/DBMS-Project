const mysql = require('mysql2/promise');
require('dotenv').config();

// ============================================================
// Connection Pool optimized for high read + frequent updates
// ============================================================
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ride_sharing_db',

    // Pool sizing for peak-hour concurrency
    connectionLimit: 50,        // Handle many concurrent requests
    queueLimit: 100,            // Queue excess requests
    waitForConnections: true,

    // Timeouts to prevent hanging connections
    connectTimeout: 10000,

    // Keep connections fresh
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,

    // Row streaming for large result sets
    rowsAsArray: false
});

// Health check helper
async function testConnection() {
    try {
        const [rows] = await pool.execute('SELECT 1 AS ping');
        return rows[0].ping === 1;
    } catch (err) {
        console.error('DB Health Check Failed:', err.message);
        return false;
    }
}

// Graceful shutdown
async function closePool() {
    await pool.end();
    console.log('Database pool closed.');
}

module.exports = { pool, testConnection, closePool };
