# Getting Started

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [server.js](file://server.js)
- [config/db.js](file://config/db.js)
- [database/schema.sql](file://database/schema.sql)
- [scripts/init-db.js](file://scripts/init-db.js)
- [routes/rides.js](file://routes/rides.js)
- [routes/drivers.js](file://routes/drivers.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Variables](#environment-variables)
5. [Database Initialization](#database-initialization)
6. [Server Startup](#server-startup)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)
9. [Conclusion](#conclusion)

## Introduction
This guide helps you set up and run the ride-sharing matching DBMS locally. It covers prerequisites, installation steps, environment configuration, database initialization, and server startup. After completing these steps, you can open the application in your browser and explore the live dashboard and APIs.

## Prerequisites
Before installing, ensure your system meets the following requirements:
- Node.js v16 or later
- MySQL v8.0 or later installed and running locally
- MySQL Workbench or any SQL client (optional, for running schema via GUI)

These requirements are confirmed by the project’s documentation and configuration.

**Section sources**
- [README.md:52-56](file://README.md#L52-L56)

## Installation
Follow these steps to install the project dependencies:

1. Open a terminal in the project root directory.
2. Install dependencies using npm:
   - Command: `npm install`

This installs the backend dependencies defined in the project configuration.

**Section sources**
- [README.md:62-66](file://README.md#L62-L66)
- [package.json:6-9](file://package.json#L6-L9)

## Environment Variables
Configure the application by editing the environment configuration file. The project loads environment variables using a dotenv loader and uses the following keys:

- DB_HOST: MySQL host address (default: localhost)
- DB_PORT: MySQL port (default: 3306)
- DB_USER: MySQL username (default: root)
- DB_PASSWORD: MySQL password (default: empty)
- DB_NAME: Database name (default: ride_sharing_db)
- PORT: Server port (default: 3000)

Set these values in your environment configuration file as shown in the project documentation.

**Section sources**
- [README.md:68-79](file://README.md#L68-L79)
- [config/db.js:7-12](file://config/db.js#L7-L12)
- [server.js:11](file://server.js#L11)

## Database Initialization
Initialize the database by applying the schema. You can use either the command line or a GUI client.

- Option A: Command-line approach
  - Connect to MySQL and run the schema file:
    - Command: `mysql -u root -p < database/schema.sql`
  - This creates all tables, stored procedures, and sample data.

- Option B: GUI approach (MySQL Workbench)
  - Open MySQL Workbench and connect to your local MySQL instance.
  - Open the schema file and execute it against the target database.

The schema defines the full database structure, including tables, indexes, stored procedures, and sample data.

**Section sources**
- [README.md:81-89](file://README.md#L81-L89)
- [database/schema.sql:1-297](file://database/schema.sql#L1-L297)

## Server Startup
Start the backend server after configuring environment variables and initializing the database:

- Command: `npm start`
- The server starts on the configured port (default: 3000) and logs health status for the database connection.

The server serves static frontend files and exposes API endpoints for rides and drivers.

**Section sources**
- [README.md:96-102](file://README.md#L96-L102)
- [server.js:72-81](file://server.js#L72-L81)
- [package.json:7](file://package.json#L7)

## Verification
After starting the server, verify the setup using the following checks:

- Health endpoint
  - Visit: `GET /api/health`
  - Purpose: Confirms database connectivity and server status.
  - Expected response: JSON indicating healthy/unhealthy status and timestamp.

- Frontend dashboard
  - Visit: `http://localhost:3000`
  - Purpose: Opens the live dashboard with stats and controls.

- API endpoints
  - Explore the documented endpoints for rides and drivers to confirm routing and basic functionality.

These checks confirm that the environment variables are loaded, the database is initialized, and the server is reachable.

**Section sources**
- [server.js:43-51](file://server.js#L43-L51)
- [README.md:110-139](file://README.md#L110-L139)
- [routes/rides.js:10-41](file://routes/rides.js#L10-L41)
- [routes/drivers.js:10-36](file://routes/drivers.js#L10-L36)

## Troubleshooting
Common issues and their solutions:

- Connection refused
  - Cause: MySQL is not running on the configured host/port.
  - Action: Ensure MySQL is running and verify DB_HOST and DB_PORT.

- Access denied
  - Cause: Incorrect DB_USER or DB_PASSWORD.
  - Action: Confirm credentials in the environment configuration.

- Table does not exist
  - Cause: Database not initialized.
  - Action: Re-run the schema initialization using the command-line or GUI approach.

- Port 3000 in use
  - Cause: Another process is using the default port.
  - Action: Change PORT in the environment configuration to another available port.

- Slow queries during peak hours
  - Cause: High load or missing indexes.
  - Action: Monitor analytics and consider adjusting pool size or indexes as needed.

These resolutions are derived from the project’s troubleshooting guidance and configuration.

**Section sources**
- [README.md:265-274](file://README.md#L265-L274)
- [config/db.js:14-27](file://config/db.js#L14-L27)

## Conclusion
You have successfully installed the ride-sharing matching DBMS, configured environment variables, initialized the database, and started the server. Use the health endpoint and dashboard to verify the setup, and consult the troubleshooting section if you encounter issues. For advanced operations, refer to the API documentation and schema details.