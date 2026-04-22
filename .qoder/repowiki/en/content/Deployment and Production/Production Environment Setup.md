# Production Environment Setup

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [server.js](file://server.js)
- [config/db.js](file://config/db.js)
- [scripts/init-db.js](file://scripts/init-db.js)
- [database/schema.sql](file://database/schema.sql)
- [routes/rides.js](file://routes/rides.js)
- [routes/drivers.js](file://routes/drivers.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Node.js Runtime and Dependencies](#nodejs-runtime-and-dependencies)
4. [Environment Variables Configuration](#environment-variables-configuration)
5. [MySQL 8.0+ Configuration](#mysql-80-configuration)
6. [Database Initialization Procedures](#database-initialization-procedures)
7. [Connection Pool Configuration](#connection-pool-configuration)
8. [Schema Validation](#schema-validation)
9. [Network Configuration](#network-configuration)
10. [Timezone, Character Encoding, and Locale](#timezone-character-encoding-and-locale)
11. [Production Deployment Workflow](#production-deployment-workflow)
12. [Monitoring and Health Checks](#monitoring-and-health-checks)
13. [Troubleshooting Guide](#troubleshooting-guide)
14. [Conclusion](#conclusion)

## Introduction
This document provides comprehensive production environment setup guidance for the ride-sharing DBMS. It focuses on MySQL 8.0+ configuration for high read operations and frequent updates, Node.js runtime requirements, environment variable configuration, database initialization, connection pooling, schema validation, and operational best practices for optimal performance.

## System Requirements
- **Operating System**: Linux (recommended), Windows, or macOS
- **CPU**: Minimum 4 cores; recommended 8+ cores for peak-hour concurrency
- **Memory**: Minimum 8 GB RAM; recommended 16+ GB for production workloads
- **Storage**: SSD with at least 100 GB available space for logs and data growth
- **Network**: Low-latency internal network between application server and MySQL
- **MySQL**: Version 8.0 or later with InnoDB storage engine support

**Section sources**
- [README.md:52-57](file://README.md#L52-L57)

## Node.js Runtime and Dependencies
- **Runtime Version**: Node.js v16 or later
- **Package Manager**: npm (Node Package Manager)
- **Key Dependencies**:
  - express: Web framework for API endpoints
  - mysql2: MySQL driver with Promise API and connection pooling
  - cors: Cross-origin resource sharing middleware
  - dotenv: Environment variable loading from .env file
- **Development Dependencies**:
  - nodemon: Automatic restart during development

**Section sources**
- [package.json:14-22](file://package.json#L14-L22)
- [README.md:54-56](file://README.md#L54-L56)

## Environment Variables Configuration
Critical environment variables for production:
- DB_HOST: MySQL server hostname or IP address
- DB_PORT: MySQL server port (default: 3306)
- DB_USER: Database username
- DB_PASSWORD: Database password
- DB_NAME: Target database name
- PORT: Application server port (default: 3000)
- NODE_ENV: Environment mode (e.g., production)

These variables are loaded via dotenv and consumed by the application and database connection pool.

**Section sources**
- [README.md:72-79](file://README.md#L72-L79)
- [config/db.js:8-12](file://config/db.js#L8-L12)
- [server.js:11](file://server.js#L11)

## MySQL 8.0+ Configuration
Optimized MySQL settings for high read throughput and frequent updates:
- Storage Engine: InnoDB (ACID compliance, row-level locking)
- Character Set: utf8mb4 with collation utf8mb4_unicode_ci for full Unicode support
- Transaction Isolation: READ COMMITTED or REPEATABLE READ depending on consistency needs
- Buffer Pool Size: 50-70% of available RAM for read-heavy workloads
- Log File Size: 256MB-1GB for balanced write performance
- Max Connections: Scaled to accommodate pool size plus administrative overhead
- Query Cache: Disabled (deprecated in MySQL 8.0; rely on application-level caching)
- Binary Logging: Enabled for replication and point-in-time recovery
- Deadlock Detection: Enabled (default)
- Temporary Tables: Use MEMORY engine for session-specific temp tables when appropriate

**Section sources**
- [database/schema.sql:7-8](file://database/schema.sql#L7-L8)
- [database/schema.sql:49](file://database/schema.sql#L49)
- [database/schema.sql:69](file://database/schema.sql#L69)
- [database/schema.sql:98](file://database/schema.sql#L98)
- [database/schema.sql:126](file://database/schema.sql#L126)
- [database/schema.sql:158](file://database/schema.sql#L158)

## Database Initialization Procedures
Follow these steps to initialize the database in production:
1. **Connect to MySQL**: Use a MySQL client or command-line interface with administrative privileges.
2. **Run Schema Script**: Execute the schema SQL script to create the database, tables, stored procedures, and sample data.
3. **Verify Tables**: Confirm creation of all tables and indexes.
4. **Test Stored Procedures**: Execute stored procedures to validate atomic operations.
5. **Seed Data**: Optionally load additional production data after schema validation.

Initialization script behavior:
- Connects to MySQL using environment variables
- Reads schema SQL from file
- Splits SQL statements by semicolon delimiter
- Executes statements sequentially
- Ignores specific errors (e.g., Unknown table) on first run
- Provides warnings for non-fatal statement issues

**Section sources**
- [README.md:81-95](file://README.md#L81-L95)
- [scripts/init-db.js:6-43](file://scripts/init-db.js#L6-L43)

## Connection Pool Configuration
Production-ready connection pool settings optimized for peak-hour concurrency:
- Pool Size: 50 connections to handle burst traffic
- Queue Limit: 100 requests to prevent overload
- Wait For Connections: Enabled to queue excess requests
- Timeouts:
  - Connect Timeout: 10 seconds
  - Acquire Timeout: 10 seconds
  - General Timeout: 10 seconds
- Keep Alive: Enabled with 10-second initial delay to maintain freshness
- Rows As Array: Disabled for structured result objects

Health check and graceful shutdown:
- Health check executes a simple SELECT statement to verify connectivity
- Graceful shutdown closes the pool to release resources

**Section sources**
- [config/db.js:7-30](file://config/db.js#L7-L30)
- [config/db.js:33-47](file://config/db.js#L33-L47)

## Schema Validation
Production schema validation checklist:
- Database Creation: Verify target database exists with correct character set and collation
- Table Existence: Confirm all six core tables are present
- Indexes: Validate strategic indexes for high-read and frequent-update scenarios
- Constraints: Ensure foreign key relationships and unique constraints are intact
- Stored Procedures: Test atomic operations for ride matching and status updates
- Sample Data: Confirm seed data is present for testing and demonstration

Validation endpoints:
- Rides API: Retrieve active rides and pending requests to verify read performance
- Drivers API: Query available drivers and update locations to verify write performance
- Stats API: Monitor system metrics for ongoing validation

**Section sources**
- [database/schema.sql:14-158](file://database/schema.sql#L14-L158)
- [routes/rides.js:10-86](file://routes/rides.js#L10-L86)
- [routes/drivers.js:10-126](file://routes/drivers.js#L10-L126)

## Network Configuration
Network considerations for optimal performance:
- **Application-Database Latency**: Place servers in the same region or low-latency network
- **Firewall Rules**: Allow inbound connections on MySQL port (default 3306) from application servers
- **Connection Security**: Use SSL/TLS for encrypted connections in production
- **Load Balancing**: Distribute traffic across multiple application instances behind a load balancer
- **DNS Resolution**: Use stable DNS names for database endpoints
- **Port Management**: Ensure application server port is open and not conflicting with other services

**Section sources**
- [README.md:72-79](file://README.md#L72-L79)
- [config/db.js:8-12](file://config/db.js#L8-L12)

## Timezone, Character Encoding, and Locale
International deployment considerations:
- **Timezone**: Set MySQL server timezone to UTC for consistent timestamp handling across regions
- **Character Encoding**: Use utf8mb4 with utf8mb4_unicode_ci for full Unicode support and proper collation
- **Locale Settings**: Configure application locale for date/time formatting and number presentation
- **Timestamp Columns**: Utilize TIMESTAMP with default values for automatic creation and update tracking
- **Indexing Strategy**: Include timezone-aware columns in indexes only when necessary for queries

**Section sources**
- [database/schema.sql:7-8](file://database/schema.sql#L7-L8)
- [database/schema.sql:21-22](file://database/schema.sql#L21-L22)
- [database/schema.sql:43-44](file://database/schema.sql#L43-L44)
- [database/schema.sql:61](file://database/schema.sql#L61)
- [database/schema.sql:88-89](file://database/schema.sql#L88-L89)
- [database/schema.sql:114-115](file://database/schema.sql#L114-L115)

## Production Deployment Workflow
Recommended deployment sequence:
1. **Pre-deployment**:
   - Provision servers with required system resources
   - Configure MySQL 8.0+ with production settings
   - Set environment variables (.env) with secure credentials
   - Install Node.js v16+ and npm dependencies
2. **Database Setup**:
   - Initialize database using the schema script
   - Validate schema and indexes
   - Seed with production data
3. **Application Deployment**:
   - Build and deploy application code
   - Configure reverse proxy (nginx/Apache) if needed
   - Set up process manager (PM2) for production stability
4. **Post-deployment**:
   - Run health checks and load tests
   - Monitor slow request thresholds and error rates
   - Configure automated backups and monitoring alerts

**Section sources**
- [README.md:60-107](file://README.md#L60-L107)
- [scripts/init-db.js:6-43](file://scripts/init-db.js#L6-L43)

## Monitoring and Health Checks
Production monitoring essentials:
- **Application Health**: Use /api/health endpoint to verify database connectivity
- **Slow Request Detection**: Middleware logs requests exceeding 500ms threshold
- **Database Metrics**: Track connection pool utilization, query response times, and error rates
- **Peak Hour Analytics**: Monitor peak_hour_stats for load patterns and capacity planning
- **Error Tracking**: Centralized logging for unhandled exceptions and database errors

**Section sources**
- [server.js:44-51](file://server.js#L44-L51)
- [server.js:21-29](file://server.js#L21-L29)
- [database/schema.sql:131-141](file://database/schema.sql#L131-L141)

## Troubleshooting Guide
Common production issues and resolutions:
- **Connection Refused**: Verify MySQL service is running and reachable on configured host/port
- **Access Denied**: Confirm DB_USER and DB_PASSWORD are correct and user has required privileges
- **Table Not Found**: Re-run schema initialization script to create missing tables
- **Port Conflicts**: Change PORT environment variable to an available port
- **Slow Queries**: Review peak-hour statistics and consider increasing pool size or optimizing queries
- **Memory Issues**: Monitor buffer pool usage and adjust MySQL innodb_buffer_pool_size

**Section sources**
- [README.md:265-274](file://README.md#L265-L274)

## Conclusion
This production setup leverages MySQL 8.0+ capabilities with strategic indexing, atomic stored procedures, and a robust Node.js application architecture. The connection pool configuration, environment-driven settings, and comprehensive monitoring ensure reliable operation during peak-hour concurrency. Follow the deployment workflow and troubleshooting guidelines to maintain optimal performance and reliability in production environments.