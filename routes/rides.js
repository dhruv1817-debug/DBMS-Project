const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// ============================================================
// RIDE REQUESTS & MATCHING API
// Focus: High read, frequent updates, peak-hour concurrency
// ============================================================

// GET /api/rides/active - High-read endpoint for dashboard
router.get('/active', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                rr.request_id,
                rr.status,
                rr.pickup_lat,
                rr.pickup_lng,
                rr.dropoff_lat,
                rr.dropoff_lng,
                rr.pickup_address,
                rr.dropoff_address,
                rr.fare_estimate,
                rr.created_at,
                u.name AS rider_name,
                COALESCE(d.name, '-') AS driver_name,
                COALESCE(d.vehicle_model, '-') AS vehicle
            FROM ride_requests rr
            JOIN users u ON rr.user_id = u.user_id
            LEFT JOIN ride_matches rm ON rr.request_id = rm.request_id
            LEFT JOIN drivers d ON rm.driver_id = d.driver_id
            WHERE rr.status IN ('pending', 'matched', 'picked_up')
            ORDER BY rr.created_at DESC
            LIMIT 100`
        );
        res.json({ success: true, count: rows.length, rides: rows });
    } catch (err) {
        console.error('Error fetching active rides:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/rides/pending - For driver app to find rides
router.get('/pending', async (req, res) => {
    try {
        const { lat, lng, radius = 5 } = req.query; // radius in km
        let sql = `
            SELECT
                rr.request_id,
                rr.pickup_lat,
                rr.pickup_lng,
                rr.dropoff_lat,
                rr.dropoff_lng,
                rr.pickup_address,
                rr.dropoff_address,
                rr.fare_estimate,
                rr.priority_score,
                rr.created_at,
                u.name AS rider_name
            FROM ride_requests rr
            JOIN users u ON rr.user_id = u.user_id
            WHERE rr.status = 'pending'
        `;
        const params = [];

        if (lat && lng) {
            // Approximate distance filter using Haversine formula
            sql += ` AND (
                6371 * ACOS(
                    COS(RADIANS(?)) * COS(RADIANS(rr.pickup_lat)) *
                    COS(RADIANS(rr.pickup_lng) - RADIANS(?)) +
                    SIN(RADIANS(?)) * SIN(RADIANS(rr.pickup_lat))
                )
            ) <= ?`;
            params.push(lat, lng, lat, parseFloat(radius));
        }

        sql += ` ORDER BY rr.priority_score DESC, rr.created_at ASC LIMIT 50`;

        const [rows] = await pool.execute(sql, params);
        res.json({ success: true, count: rows.length, requests: rows });
    } catch (err) {
        console.error('Error fetching pending rides:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/rides/request - Create ride request (high insert rate)
router.post('/request', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const {
            user_id,
            pickup_lat,
            pickup_lng,
            dropoff_lat,
            dropoff_lng,
            pickup_address,
            dropoff_address,
            fare_estimate
        } = req.body;

        await conn.beginTransaction();

        // Insert request
        const [result] = await conn.execute(
            `INSERT INTO ride_requests
             (user_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
              pickup_address, dropoff_address, fare_estimate, priority_score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
                pickup_address || null, dropoff_address || null,
                fare_estimate || null,
                calculatePriorityScore() // helper below
            ]
        );

        await conn.commit();

        res.json({
            success: true,
            request_id: result.insertId,
            message: 'Ride request created'
        });
    } catch (err) {
        await conn.rollback();
        console.error('Error creating ride request:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        conn.release();
    }
});

// POST /api/rides/match - ATOMIC MATCH with stored procedure
// Critical for peak-hour concurrency (prevents double-booking)
router.post('/match', async (req, res) => {
    try {
        const { request_id, driver_id, fare_estimate } = req.body;

        const [rows] = await pool.execute(
            'CALL sp_match_ride(?, ?, ?, @match_id, @success)',
            [request_id, driver_id, fare_estimate]
        );

        // Fetch output parameters
        const [[out]] = await pool.execute(
            'SELECT @match_id AS match_id, @success AS success'
        );

        if (out.success) {
            res.json({
                success: true,
                match_id: out.match_id,
                message: 'Ride matched successfully'
            });
        } else {
            res.status(409).json({
                success: false,
                error: 'Ride already matched or driver unavailable'
            });
        }
    } catch (err) {
        console.error('Error matching ride:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/rides/:id/status - Update ride & match status
router.put('/:id/status', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { id } = req.params;
        const { status, version } = req.body;

        await conn.beginTransaction();

        // Update request status
        const [reqResult] = await conn.execute(
            `UPDATE ride_requests
             SET status = ?, version = version + 1
             WHERE request_id = ?`,
            [status, id]
        );

        // Sync match status if exists
        let matchStatus = status;
        if (status === 'picked_up') matchStatus = 'in_progress';
        if (status === 'matched') matchStatus = 'assigned';

        const [matchResult] = await conn.execute(
            `UPDATE ride_matches
             SET status = ?
             WHERE request_id = ?`,
            [matchStatus, id]
        );

        // If ride completed or cancelled, free the driver
        if (status === 'completed' || status === 'cancelled') {
            await conn.execute(
                `UPDATE drivers d
                 JOIN ride_matches rm ON d.driver_id = rm.driver_id
                 SET d.status = 'available'
                 WHERE rm.request_id = ?`,
                [id]
            );
        }

        await conn.commit();

        res.json({
            success: true,
            request_updated: reqResult.affectedRows,
            match_updated: matchResult.affectedRows,
            message: `Status updated to ${status}`
        });
    } catch (err) {
        await conn.rollback();
        console.error('Error updating ride status:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        conn.release();
    }
});

// GET /api/rides/stats - Peak-hour monitoring
router.get('/stats', async (req, res) => {
    try {
        const [pending] = await pool.execute(
            `SELECT COUNT(*) AS count FROM ride_requests WHERE status = 'pending'`
        );
        const [matched] = await pool.execute(
            `SELECT COUNT(*) AS count FROM ride_requests WHERE status = 'matched'`
        );
        const [active] = await pool.execute(
            `SELECT COUNT(*) AS count FROM ride_matches WHERE status IN ('assigned','picked_up','in_progress')`
        );
        const [availableDrivers] = await pool.execute(
            `SELECT COUNT(*) AS count FROM drivers WHERE status = 'available'`
        );
        const [completedToday] = await pool.execute(
            `SELECT COUNT(*) AS count FROM ride_matches WHERE status = 'completed' AND DATE(completed_at) = CURDATE()`
        );

        res.json({
            success: true,
            stats: {
                pending_requests: pending[0].count,
                matched_rides: matched[0].count,
                active_trips: active[0].count,
                available_drivers: availableDrivers[0].count,
                completed_today: completedToday[0].count
            }
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper: priority scoring for peak-hour queue
function calculatePriorityScore() {
    const hour = new Date().getHours();
    // Peak hours: 7-9 AM and 5-8 PM get higher priority
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20)) {
        return 10.0;
    }
    return 5.0;
}

module.exports = router;
