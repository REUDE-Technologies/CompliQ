const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// --- AUTHENTICATION ROUTES ---
app.post('/api/auth/register', (req, res) => {
    const { firstName, lastName, org, email, password, role, sector } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const sql = `INSERT INTO users (firstName, lastName, org, email, password, role, sector) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [firstName, lastName, org, email, password, role, sector], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, firstName, lastName, email, role, sector });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password, sector } = req.body;
    const sql = `SELECT * FROM users WHERE email = ? AND password = ?`;
    
    db.get(sql, [email, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'Invalid email or password' });
        
        const { password, ...user } = row;
        user.sector = sector || user.sector; 
        res.json({ user });
    });
});

// --- DATA STORE ROUTES ---
// We use a simple JSON document store per sector to perfectly integrate with the frontend's complex schema

app.get('/api/data/:key', (req, res) => {
    db.get('SELECT data FROM store WHERE key = ?', [req.params.key], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            res.json(JSON.parse(row.data));
        } else {
            res.json(null);
        }
    });
});

app.post('/api/data/:key', (req, res) => {
    const key = req.params.key;
    const dataString = JSON.stringify(req.body);
    
    db.run(`INSERT INTO store (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data`, 
    [key, dataString], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        // Sync to relational turbines table if applicable
        if (key === 'reude_fleet_db' && req.body && Array.isArray(req.body.turbines)) {
            const turbines = req.body.turbines;
            const stmt = db.prepare(`INSERT OR REPLACE INTO turbines 
                (id, name, location, age, power, windSpeed, rpm, health) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            
            turbines.forEach(t => {
                const currentYear = new Date().getFullYear();
                const age = t.commYear ? (currentYear - t.commYear) + ' yrs' : '0 yrs';
                const power = t.power ? t.power + ' MW' : '0 MW';
                stmt.run([t.id, t.assetId || t.name, t.location, age, power, t.windSpeed, t.rpm, t.health]);
            });
            stmt.finalize();
            
            // Clean up deleted turbines
            const turbineIds = turbines.map(t => t.id);
            if (turbineIds.length > 0) {
                const placeholders = turbineIds.map(() => '?').join(',');
                db.run(`DELETE FROM turbines WHERE id NOT IN (${placeholders})`, turbineIds);
            } else {
                db.run('DELETE FROM turbines');
            }
            
            // Sync to relational anomalies table if applicable
            if (req.body.defects && Array.isArray(req.body.defects)) {
                const defects = req.body.defects;
                const astmt = db.prepare(`INSERT OR REPLACE INTO anomalies 
                    (id, turbineId, blade, type, distance, severity, confidence, action, status, image, thermal, coordsX, coordsY, details) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                
                defects.forEach(d => {
                    astmt.run([
                        d.id, d.turbineId, d.location?.blade || '', d.type, d.location?.distance || 0,
                        d.severity, d.confidence, d.action || '', d.status || '', d.image || '', d.thermal || '',
                        d.coords?.x || 0, d.coords?.y || 0, d.notes || ''
                    ]);
                });
                astmt.finalize();
                
                // Clean up deleted anomalies
                const defectIds = defects.map(d => d.id);
                if (defectIds.length > 0) {
                    const placeholders = defectIds.map(() => '?').join(',');
                    db.run(`DELETE FROM anomalies WHERE id NOT IN (${placeholders})`, defectIds);
                } else {
                    db.run('DELETE FROM anomalies');
                }
            }
        }
        
        res.json({ success: true });
    });
});



// --- ADMIN ROUTES ---
app.get('/api/admin/users', (req, res) => {
    db.all('SELECT id, firstName, lastName, org, email, role, sector, createdAt FROM users', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/admin/users/:id', (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

app.put('/api/admin/users/:id/role', (req, res) => {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'Role is required' });
    
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, updated: this.changes });
    });
});

// Catch-all route to serve index.html for unknown paths (SPA behavior)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
