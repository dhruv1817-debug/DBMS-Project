const { pool } = require('../config/db');

async function seed() {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Clear existing rides to avoid conflicts
        await conn.execute('DELETE FROM ride_matches');
        await conn.execute('DELETE FROM ride_requests');

        // Insert sample ride requests
        const [reqRes] = await conn.execute(
            `INSERT INTO ride_requests
             (user_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
              pickup_address, dropoff_address, status, fare_estimate, priority_score)
             VALUES
             (1, 40.7128, -74.0060, 40.7580, -73.9855, 'Wall Street', 'Times Square', 'pending', 18.50, 10.0),
             (2, 40.7300, -73.9900, 40.7500, -73.9800, 'Greenwich Village', 'Empire State Building', 'pending', 22.00, 10.0),
             (3, 40.7480, -73.9850, 40.7200, -74.0100, 'Flatiron District', 'Brooklyn Bridge', 'matched', 16.75, 10.0),
             (4, 40.7610, -73.9800, 40.7128, -74.0060, 'Central Park South', 'One World Trade', 'picked_up', 25.00, 10.0),
             (5, 40.7200, -74.0000, 40.7580, -73.9855, 'Soho', 'Times Square', 'completed', 19.50, 10.0)`
        );

        // Insert sample matches
        await conn.execute(
            `INSERT INTO ride_matches (request_id, driver_id, status, fare_final, distance_km)
             VALUES (3, 1, 'assigned', 16.75, 4.2),
                    (4, 2, 'picked_up', 25.00, 8.5),
                    (5, 3, 'completed', 19.50, 5.1)`
        );

        // Update driver statuses to reflect matches
        await conn.execute(`UPDATE drivers SET status = 'on_trip' WHERE driver_id = 1`);
        await conn.execute(`UPDATE drivers SET status = 'on_trip' WHERE driver_id = 2`);

        await conn.commit();
        console.log('Database seeded successfully!');
        console.log('- 2 pending requests');
        console.log('- 1 matched ride');
        console.log('- 1 active pickup');
        console.log('- 1 completed ride');
        console.log('- 2 drivers on trip, 2 available, 1 offline');
    } catch (err) {
        await conn.rollback();
        console.error('Seed failed:', err.message);
        process.exit(1);
    } finally {
        conn.release();
        await pool.end();
    }
}

seed();
