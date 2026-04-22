-- ============================================================
-- Ride Sharing Matching DBMS Schema
-- Focus: High Read + Frequent Updates + Peak-Hour Concurrency
-- ============================================================

CREATE DATABASE IF NOT EXISTS ride_sharing_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ride_sharing_db;

-- ============================================================
-- 1. USERS (Riders)
-- ============================================================
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    user_id         INT PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    phone           VARCHAR(20) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_email (email),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- 2. DRIVERS
-- ============================================================
DROP TABLE IF EXISTS drivers;
CREATE TABLE drivers (
    driver_id       INT PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    phone           VARCHAR(20) NOT NULL,
    vehicle_model   VARCHAR(100) NOT NULL,
    vehicle_plate   VARCHAR(20) NOT NULL UNIQUE,
    status          ENUM('offline','available','busy','on_trip') DEFAULT 'offline',
    rating          DECIMAL(2,1) DEFAULT 5.0,
    total_trips     INT DEFAULT 0,
    version         INT DEFAULT 0,              -- Optimistic locking
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_status (status),                   -- High read: find available drivers
    INDEX idx_rating (rating),
    INDEX idx_updated_at (updated_at)            -- Frequent updates tracking
) ENGINE=InnoDB;

-- ============================================================
-- 3. DRIVER LOCATIONS (Frequent updates during peak hours)
-- ============================================================
DROP TABLE IF EXISTS driver_locations;
CREATE TABLE driver_locations (
    location_id     INT PRIMARY KEY AUTO_INCREMENT,
    driver_id       INT NOT NULL,
    latitude        DECIMAL(10, 8) NOT NULL,
    longitude       DECIMAL(11, 8) NOT NULL,
    accuracy        DECIMAL(6, 2) DEFAULT NULL,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
        ON DELETE CASCADE,

    UNIQUE KEY uk_driver (driver_id),            -- One row per driver
    INDEX idx_location (latitude, longitude),    -- Spatial-ish queries
    INDEX idx_updated (updated_at)               -- Cleanup stale locations
) ENGINE=InnoDB;

-- ============================================================
-- 4. RIDE REQUESTS (High insert rate during peak hours)
-- ============================================================
DROP TABLE IF EXISTS ride_requests;
CREATE TABLE ride_requests (
    request_id      INT PRIMARY KEY AUTO_INCREMENT,
    user_id         INT NOT NULL,
    pickup_lat      DECIMAL(10, 8) NOT NULL,
    pickup_lng      DECIMAL(11, 8) NOT NULL,
    dropoff_lat     DECIMAL(10, 8) NOT NULL,
    dropoff_lng     DECIMAL(11, 8) NOT NULL,
    pickup_address  VARCHAR(255) DEFAULT NULL,
    dropoff_address VARCHAR(255) DEFAULT NULL,
    status          ENUM('pending','matched','picked_up','completed','cancelled') DEFAULT 'pending',
    fare_estimate   DECIMAL(10, 2) DEFAULT NULL,
    priority_score  DECIMAL(5, 2) DEFAULT 0,     -- For peak-hour queue ordering
    version         INT DEFAULT 0,              -- Optimistic locking
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,

    INDEX idx_status_created (status, created_at),  -- Pending rides ordered by time
    INDEX idx_user_status (user_id, status),        -- Active ride lookup
    INDEX idx_pickup (pickup_lat, pickup_lng),      -- Nearby ride search
    INDEX idx_priority (priority_score DESC)        -- Peak-hour queue
) ENGINE=InnoDB;

-- ============================================================
-- 5. RIDE MATCHES (Core matching table - high contention)
-- ============================================================
DROP TABLE IF EXISTS ride_matches;
CREATE TABLE ride_matches (
    match_id        INT PRIMARY KEY AUTO_INCREMENT,
    request_id      INT NOT NULL,
    driver_id       INT NOT NULL,
    status          ENUM('assigned','picked_up','in_progress','completed','cancelled') DEFAULT 'assigned',
    fare_final      DECIMAL(10, 2) DEFAULT NULL,
    distance_km     DECIMAL(6, 2) DEFAULT NULL,
    started_at      TIMESTAMP NULL DEFAULT NULL,
    completed_at    TIMESTAMP NULL DEFAULT NULL,
    version         INT DEFAULT 0,              -- Optimistic locking
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (request_id) REFERENCES ride_requests(request_id)
        ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
        ON DELETE CASCADE,

    UNIQUE KEY uk_request (request_id),          -- One match per request
    INDEX idx_driver_status (driver_id, status), -- Driver's active matches
    INDEX idx_status (status),                   -- Analytics / monitoring
    INDEX idx_created (created_at)               -- Recent matches
) ENGINE=InnoDB;

-- ============================================================
-- 6. PEAK HOUR STATS (Analytics for load monitoring)
-- ============================================================
DROP TABLE IF EXISTS peak_hour_stats;
CREATE TABLE peak_hour_stats (
    stat_id         INT PRIMARY KEY AUTO_INCREMENT,
    hour_block      DATETIME NOT NULL,           -- Truncated to hour
    requests_count  INT DEFAULT 0,
    matches_count   INT DEFAULT 0,
    avg_wait_sec    INT DEFAULT NULL,
    cancelled_count INT DEFAULT 0,

    UNIQUE KEY uk_hour (hour_block)
) ENGINE=InnoDB;

-- ============================================================
-- 7. DRIVER QUEUE (Peak-hour FIFO queue for fair matching)
-- ============================================================
DROP TABLE IF EXISTS driver_queue;
CREATE TABLE driver_queue (
    queue_id        INT PRIMARY KEY AUTO_INCREMENT,
    driver_id       INT NOT NULL,
    zone_id         VARCHAR(20) NOT NULL,        -- Geohash / city zone
    queued_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
        ON DELETE CASCADE,

    UNIQUE KEY uk_driver_zone (driver_id, zone_id),
    INDEX idx_zone_time (zone_id, queued_at)     -- FIFO per zone
) ENGINE=InnoDB;

-- ============================================================
-- STORED PROCEDURES FOR ATOMIC OPERATIONS
-- ============================================================

DELIMITER //

-- Atomic match: prevents double-booking under high concurrency
CREATE PROCEDURE sp_match_ride (
    IN p_request_id INT,
    IN p_driver_id  INT,
    IN p_fare_estimate DECIMAL(10,2),
    OUT p_match_id  INT,
    OUT p_success   BOOLEAN
)
BEGIN
    DECLARE v_req_version INT;
    DECLARE v_drv_version INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_success = FALSE;
        RESIGNAL;
    END;

    SET p_success = FALSE;

    START TRANSACTION;

    -- Lock request row with FOR UPDATE (pessimistic lock)
    SELECT version INTO v_req_version
    FROM ride_requests
    WHERE request_id = p_request_id
      AND status = 'pending'
    FOR UPDATE;

    IF v_req_version IS NULL THEN
        ROLLBACK;
        SET p_success = FALSE;
    ELSE
        -- Lock driver row with FOR UPDATE
        SELECT version INTO v_drv_version
        FROM drivers
        WHERE driver_id = p_driver_id
          AND status = 'available'
        FOR UPDATE;

        IF v_drv_version IS NULL THEN
            ROLLBACK;
            SET p_success = FALSE;
        ELSE
            -- Update request
            UPDATE ride_requests
            SET status = 'matched',
                version = version + 1,
                fare_estimate = p_fare_estimate
            WHERE request_id = p_request_id;

            -- Update driver status
            UPDATE drivers
            SET status = 'on_trip',
                version = version + 1,
                total_trips = total_trips + 1
            WHERE driver_id = p_driver_id;

            -- Create match record
            INSERT INTO ride_matches (request_id, driver_id, status)
            VALUES (p_request_id, p_driver_id, 'assigned');

            SET p_match_id = LAST_INSERT_ID();
            SET p_success = TRUE;

            COMMIT;
        END IF;
    END IF;
END //

-- Atomic status update with optimistic locking check
CREATE PROCEDURE sp_update_match_status (
    IN p_match_id   INT,
    IN p_new_status VARCHAR(20),
    IN p_expected_version INT,
    OUT p_success   BOOLEAN
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        SET p_success = FALSE;
        RESIGNAL;
    END;

    UPDATE ride_matches
    SET status = p_new_status,
        version = version + 1,
        started_at = CASE WHEN p_new_status = 'in_progress' THEN NOW() ELSE started_at END,
        completed_at = CASE WHEN p_new_status = 'completed' THEN NOW() ELSE completed_at END
    WHERE match_id = p_match_id
      AND version = p_expected_version;

    IF ROW_COUNT() > 0 THEN
        SET p_success = TRUE;
    ELSE
        SET p_success = FALSE;
    END IF;
END //

-- Cleanup stale driver locations (call periodically)
CREATE PROCEDURE sp_cleanup_stale_locations (IN p_minutes INT)
BEGIN
    DELETE FROM driver_locations
    WHERE updated_at < DATE_SUB(NOW(), INTERVAL p_minutes MINUTE);
END //

DELIMITER ;

-- ============================================================
-- SAMPLE DATA
-- ============================================================

INSERT INTO users (name, email, phone) VALUES
('Alice Johnson', 'alice@email.com', '555-0101'),
('Bob Smith', 'bob@email.com', '555-0102'),
('Carol White', 'carol@email.com', '555-0103'),
('David Brown', 'david@email.com', '555-0104'),
('Emma Davis', 'emma@email.com', '555-0105');

INSERT INTO drivers (name, email, phone, vehicle_model, vehicle_plate, status, rating) VALUES
('John Driver', 'john@driver.com', '555-1001', 'Toyota Camry', 'ABC-1234', 'available', 4.8),
('Sarah Rider', 'sarah@driver.com', '555-1002', 'Honda Civic', 'XYZ-5678', 'available', 4.9),
('Mike Wheels', 'mike@driver.com', '555-1003', 'Tesla Model 3', 'EV-9999', 'available', 4.7),
('Lisa Fast', 'lisa@driver.com', '555-1004', 'Ford Mustang', 'MUS-2024', 'offline', 4.6),
('Tom Cruiser', 'tom@driver.com', '555-1005', 'Chevy Bolt', 'BLT-7777', 'available', 4.9);

INSERT INTO driver_locations (driver_id, latitude, longitude) VALUES
(1, 40.7128, -74.0060),   -- NYC area
(2, 40.7200, -74.0100),
(3, 40.7150, -74.0020),
(5, 40.7180, -74.0080);

-- ============================================================
-- SAMPLE RIDE REQUESTS (so dashboard shows data immediately)
-- ============================================================
INSERT INTO ride_requests
(user_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address, dropoff_address, status, fare_estimate, priority_score)
VALUES
(1, 40.7128, -74.0060, 40.7580, -73.9855, 'Wall Street', 'Times Square', 'pending', 18.50, 10.0),
(2, 40.7300, -73.9900, 40.7500, -73.9800, 'Greenwich Village', 'Empire State Building', 'pending', 22.00, 10.0),
(3, 40.7480, -73.9850, 40.7200, -74.0100, 'Flatiron District', 'Brooklyn Bridge', 'matched', 16.75, 10.0),
(4, 40.7610, -73.9800, 40.7128, -74.0060, 'Central Park South', 'One World Trade', 'picked_up', 25.00, 10.0),
(5, 40.7200, -74.0000, 40.7580, -73.9855, 'Soho', 'Times Square', 'completed', 19.50, 10.0);

-- ============================================================
-- SAMPLE RIDE MATCHES
-- ============================================================
INSERT INTO ride_matches
(request_id, driver_id, status, fare_final, distance_km)
VALUES
(3, 1, 'assigned', 16.75, 4.2),
(4, 2, 'picked_up', 25.00, 8.5),
(5, 3, 'completed', 19.50, 5.1);
