const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    });

    try {
        console.log('Connected to MySQL. Initializing database...');

        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

        // Split statements and execute
        const statements = schemaSql.split(';').filter(s => s.trim().length > 0);

        for (let stmt of statements) {
            stmt = stmt.trim();
            if (!stmt) continue;
            try {
                await conn.execute(stmt);
            } catch (err) {
                // Ignore DROP IF EXISTS errors on first run
                if (!err.message.includes('Unknown table')) {
                    console.warn('Statement warning:', err.message.split('\n')[0]);
                }
            }
        }

        console.log('Database initialized successfully!');
    } catch (err) {
        console.error('Database initialization failed:', err.message);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

initDatabase();
