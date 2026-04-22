# Ride Sharing Matching DBMS

A full-stack DBMS mini project focused on **high read operations**, **frequent updates**, and **peak-hour concurrency** in a ride-sharing matching system.

---

## Features

- **Rider Requests**: Create ride requests with pickup/dropoff locations
- **Driver Management**: Register drivers, update locations, toggle availability
- **Real-time Matching**: Atomic ride-to-driver matching with pessimistic locking
- **Peak-hour Optimizations**: Priority scoring, connection pooling, indexed queries
- **Live Dashboard**: Auto-refreshing stats and activity tables
- **Concurrency Safe**: Stored procedures with `FOR UPDATE` locks prevent double-booking

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Node.js, Express.js |
| Database | MySQL 8.0+ |
| Driver | mysql2 (with Promise API & Connection Pooling) |

---

## Project Structure

```
ride-sharing-matching-db/
├── config/
│   └── db.js              # MySQL connection pool (50 connections)
├── database/
│   └── schema.sql         # Full DB schema + stored procedures + sample data
├── public/
│   ├── css/style.css      # Responsive UI styles
│   ├── js/app.js          # Frontend logic & API calls
│   └── index.html         # Single-page dashboard
├── routes/
│   ├── rides.js           # Ride request & matching APIs
│   └── drivers.js         # Driver management APIs
├── server.js              # Express server entry point
├── package.json           # Node dependencies
├── .env                   # Environment configuration
└── README.md              # This file
```

---

## Prerequisites

1. **Node.js** (v16 or later)
2. **MySQL** (v8.0 or later) running locally
3. **MySQL Workbench** or any SQL client (optional, for running schema)

---

## Setup Instructions

### 1. Install Node Dependencies

```bash
npm install
```

### 2. Configure Database Connection

Edit `.env` with your MySQL credentials:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=ride_sharing_db
PORT=3000
```

### 3. Initialize the Database

Open MySQL and run the schema file:

```bash
mysql -u root -p < database/schema.sql
```

Or connect via MySQL Workbench and execute `database/schema.sql`.

This creates:
- All tables (`users`, `drivers`, `driver_locations`, `ride_requests`, `ride_matches`, etc.)
- Stored procedures for atomic matching (`sp_match_ride`)
- Sample data (5 users, 5 drivers, 4 locations)

### 4. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`.

### 5. Open the Application

Visit `http://localhost:3000` in your browser.

---

## API Endpoints

### Rides

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rides/active` | List all active & pending rides |
| GET | `/api/rides/pending` | List pending requests (optional `?lat=&lng=&radius=`) |
| POST | `/api/rides/request` | Create a new ride request |
| POST | `/api/rides/match` | Atomically match a driver to a request |
| PUT | `/api/rides/:id/status` | Update ride status (pickup, complete, cancel) |
| GET | `/api/rides/stats` | Dashboard statistics |

### Drivers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drivers` | List all drivers |
| GET | `/api/drivers/available` | List available drivers near location |
| POST | `/api/drivers/register` | Register a new driver |
| PUT | `/api/drivers/:id/location` | Update driver GPS location (frequent) |
| PUT | `/api/drivers/:id/status` | Toggle driver status |
| GET | `/api/drivers/:id/rides` | Get driver's ride history |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Database connectivity check |

---

## Concurrency Optimizations

### 1. Connection Pooling
- Pool size: **50 connections** with queue limit of 100
- Handles burst traffic during peak hours without dropping requests

### 2. Atomic Matching via Stored Procedure
```sql
CALL sp_match_ride(request_id, driver_id, fare_estimate, @match_id, @success);
```
- Uses `SELECT ... FOR UPDATE` to lock rows
- Prevents two drivers from matching the same ride simultaneously
- Prevents one driver from being assigned two rides at once

### 3. Optimistic Locking
- `version` columns on `drivers` and `ride_requests`
- Detects stale data during concurrent updates

### 4. Strategic Indexing
- `idx_status` on drivers for fast available-driver queries
- `idx_status_created` on ride_requests for pending-queue ordering
- `idx_pickup` on location fields for geo-radius searches
- `idx_driver_status` on matches for driver activity tracking

### 5. Upsert for Frequent Location Updates
```sql
INSERT ... ON DUPLICATE KEY UPDATE
```
- Single atomic operation instead of read-then-write
- Eliminates race conditions on location table

### 6. Priority Scoring
- Peak hours (7-9 AM, 5-8 PM) automatically get higher priority scores
- Ensures fair queue ordering under heavy load

---

## Database Schema

```
users              -- Riders
  ├── user_id (PK)
  ├── name, email, phone
  └── created_at

drivers            -- Drivers
  ├── driver_id (PK)
  ├── name, email, phone
  ├── vehicle_model, vehicle_plate
  ├── status (offline|available|busy|on_trip)
  ├── rating, total_trips
  └── version (optimistic lock)

driver_locations   -- Live GPS (frequent updates)
  ├── driver_id (FK, Unique)
  ├── latitude, longitude
  └── updated_at

ride_requests      -- Ride bookings (high insert rate)
  ├── request_id (PK)
  ├── user_id (FK)
  ├── pickup_lat, pickup_lng
  ├── dropoff_lat, dropoff_lng
  ├── status (pending|matched|picked_up|completed|cancelled)
  ├── fare_estimate, priority_score
  └── version (optimistic lock)

ride_matches       -- Core matching table (high contention)
  ├── match_id (PK)
  ├── request_id (FK, Unique)
  ├── driver_id (FK)
  ├── status, fare_final, distance_km
  ├── started_at, completed_at
  └── version (optimistic lock)

peak_hour_stats    -- Analytics for monitoring
  ├── hour_block, requests_count
  ├── matches_count, avg_wait_sec
  └── cancelled_count

driver_queue       -- FIFO zone queue for fair matching
  ├── driver_id (FK), zone_id
  └── queued_at
```

---

## Usage Guide

### Request a Ride
1. Go to the **Ride Requests** tab
2. Click **"+ Request New Ride"**
3. Fill in pickup/dropoff details
4. Submit

### Match a Driver
1. Go to the **Match Console** tab
2. Select a pending request from the left panel
3. Select an available driver from the right panel
4. Click **"Match Ride"**

### Manage Rides
- Use action buttons in the **Ride Requests** table to mark pickups, completions, or cancellations
- Completing or cancelling a ride automatically frees the driver

### Register / Update Drivers
- Use the **Register** tab to add new drivers
- Update driver locations manually (simulates GPS tracking)
- Toggle driver online/offline status from the **Drivers** tab

---

## Screenshots

The dashboard displays:
- **Live stats cards** (pending, matched, active, available drivers, completed today)
- **Active rides table** with status badges and action buttons
- **Driver roster** with live location and status
- **Match console** with selectable request/driver cards
- **Registration forms** for drivers and location updates

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` | Ensure MySQL is running on the configured host/port |
| `Access denied` | Check `DB_USER` and `DB_PASSWORD` in `.env` |
| `Table doesn't exist` | Run `database/schema.sql` to initialize the database |
| Port 3000 in use | Change `PORT` in `.env` to another value |
| Slow queries during peak | Monitor `peak_hour_stats`; increase pool size if needed |

---

## Future Enhancements

- WebSocket integration for real-time push updates
- Redis caching layer for driver location reads
- Geohash-based spatial indexing for faster nearby searches
- Load balancer with multiple Node.js instances
- Payment integration and fare calculation engine

---

## License

MIT
