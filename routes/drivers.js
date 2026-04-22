const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// ============================================================
// DRIVERS API
// Focus: Frequent location updates, status changes
// ============================================================

// GET /api/drivers - List all drivers
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                d.driver_id,
                d.name,
                d.email,
                d.phone,
                d.vehicle_model,
                d.vehicle_plate,
                d.status,
                d.rating,
                d.total_trips,
                dl.latitude,
                dl.longitude,
                dl.updated_at AS location_updated
            FROM drivers d
            LEFT JOIN driver_locations dl ON d.driver_id = dl.driver_id
            ORDER BY d.status, d.name`
        );
        res.json({ success: true, count: rows.length, drivers: rows });
    } catch (err) {
        console.error('Error fetching drivers:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/drivers/available - High-read during peak hours
router.get('/available', async (req, res) => {
    try {
        const { lat, lng, radius = 5 } = req.query;
        let sql = `
            SELECT
                d.driver_id,
                d.name,
                d.vehicle_model,
                d.vehicle_plate,
                d.rating,
                dl.latitude,
                dl.longitude,
                dl.updated_at AS location_updated
            FROM drivers d
            JOIN driver_locations dl ON d.driver_id = dl.driver_id
            WHERE d.status = 'available'
        `;
        const params = [];

        if (lat && lng) {
            sql += ` AND (
                6371 * ACOS(
                    COS(RADIANS(?)) * COS(RADIANS(dl.latitude)) *
                    COS(RADIANS(dl.longitude) - RADIANS(?)) +
                    SIN(RADIANS(?)) * SIN(RADIANS(dl.latitude))
                )
            ) <= ?`;
            params.push(lat, lng, lat, parseFloat(radius));
        }

        sql += ` ORDER BY dl.updated_at DESC LIMIT 50`;

        const [rows] = await pool.execute(sql, params);
        res.json({ success: true, count: rows.length, drivers: rows });
    } catch (err) {
        console.error('Error fetching available drivers:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/drivers/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, vehicle_model, vehicle_plate } = req.body;

        const [result] = await pool.execute(
            `INSERT INTO drivers (name, email, phone, vehicle_model, vehicle_plate)
             VALUES (?, ?, ?, ?, ?)`,
            [name, email, phone, vehicle_model, vehicle_plate]
        );

        res.json({
            success: true,
            driver_id: result.insertId,
            message: 'Driver registered successfully'
        });
    } catch (err) {
        console.error('Error registering driver:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/drivers/:id/location - FREQUENT UPDATE endpoint
// Called every few seconds during active driving
router.put('/:id/location', async (req, res) => {
    try {
        const { id } = req.params;
        const { latitude, longitude, accuracy } = req.body;

        // Upsert location using INSERT ... ON DUPLICATE KEY UPDATE
        // Single atomic operation avoids race conditions
        await pool.execute(
            `INSERT INTO driver_locations (driver_id, latitude, longitude, accuracy)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                latitude = VALUES(latitude),
                longitude = VALUES(longitude),
                accuracy = VALUES(accuracy),
                updated_at = CURRENT_TIMESTAMP`,
            [id, latitude, longitude, accuracy || null]
        );

        res.json({ success: true, message: 'Location updated' });
    } catch (err) {
        console.error('Error updating location:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/drivers/:id/status
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const [result] = await pool.execute(
            `UPDATE drivers SET status = ? WHERE driver_id = ?`,
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Driver not found' });
        }

        res.json({ success: true, message: `Status updated to ${status}` });
    } catch (err) {
        console.error('Error updating driver status:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/drivers/:id/rides
router.get('/:id/rides', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.execute(
            `SELECT
                rm.match_id,
                rm.status,
                rm.fare_final,
                rm.distance_km,
                rm.created_at,
                rm.started_at,
                rm.completed_at,
                rr.pickup_address,
                rr.dropoff_address,
                u.name AS rider_name
            FROM ride_matches rm
            JOIN ride_requests rr ON rm.request_id = rr.request_id
            JOIN users u ON rr.user_id = u.user_id
            WHERE rm.driver_id = ?
            ORDER BY rm.created_at DESC
            LIMIT 20`,
            [id]
        );
        res.json({ success: true, count: rows.length, rides: rows });
    } catch (err) {
        console.error('Error fetching driver rides:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
