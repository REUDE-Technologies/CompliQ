const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Initialize tables
db.serialize(() => {
    // Users table for Authentication
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT,
        lastName TEXT,
        org TEXT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT,
        sector TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Add default admin user if not exists
    db.get("SELECT * FROM users WHERE email = 'admin@reude.com'", (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (firstName, lastName, org, email, password, role, sector) 
                    VALUES ('Admin', 'Operator', 'REUDE Technologies', 'admin@reude.com', 'password123', 'Administrator', 'wind')`);
        }
    });

    // We'll use a document store approach for the dashboard data to easily support the complex nested structures
    // of dashboard.js and solar-dashboard without creating 20 relational tables.
    db.run(`CREATE TABLE IF NOT EXISTS store (
        key TEXT PRIMARY KEY,
        data TEXT
    )`);

    // Synchronized relational table for turbines
    db.run(`CREATE TABLE IF NOT EXISTS turbines (
        id INTEGER PRIMARY KEY,
        name TEXT,
        location TEXT,
        age TEXT,
        power TEXT,
        windSpeed REAL,
        rpm REAL,
        health INTEGER
    )`);

    // Synchronized relational table for defects/anomalies
    db.run(`CREATE TABLE IF NOT EXISTS anomalies (
        id TEXT PRIMARY KEY,
        turbineId TEXT,
        blade TEXT,
        type TEXT,
        distance INTEGER,
        severity INTEGER,
        confidence REAL,
        action TEXT,
        status TEXT,
        image TEXT,
        thermal TEXT,
        coordsX INTEGER,
        coordsY INTEGER,
        details TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = db;
