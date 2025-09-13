const fs = require('fs').readFileSync;

function parseLogs(file) {
    try {
        return fs(file, 'utf8').split('\n').filter(line => line).map(JSON.parse);
    } catch (error) {
        console.error(`Error reading ${file}:`, error);
        return [];
    }
}

function summarizeData() {
    const userLogs = parseLogs('user_logs.json');
    const surveyLogs = parseLogs('survey_logs.json');
    const geoLogs = parseLogs('geo_logs.json');
    const webrtcLogs = parseLogs('webrtc_logs.json');
    const clickLogs = parseLogs('click_logs.json');
    const sessionLogs = parseLogs('session_logs.json');

    // Browser summary
    const browsers = userLogs.reduce((acc, log) => {
        const browser = log.browser?.name || 'Unknown';
        acc[browser] = (acc[browser] || 0) + 1;
        return acc;
    }, {});

    // Session duration
    const sessionDurations = sessionLogs.map(log => parseInt(log.sessionDuration) || 0);
    const avgSessionDuration = sessionDurations.length
        ? (sessionDurations.reduce((sum, dur) => sum + dur, 0) / sessionDurations.length).toFixed(2)
        : 0;

    // Survey responses
    const exerciseFrequencies = surveyLogs.reduce((acc, log) => {
        acc[log.frequency] = (acc[log.frequency] || 0) + 1;
        return acc;
    }, {});
    const fitnessGoals = surveyLogs.reduce((acc, log) => {
        acc[log.goal] = (acc[log.goal] || 0) + 1;
        return acc;
    }, {});

    // Geolocation
    const locations = geoLogs.map(log => ({
        latitude: log.latitude,
        longitude: log.longitude,
        accuracy: log.accuracy
    }));

    // Click events
    const clickSummary = clickLogs.reduce((acc, log) => {
        log.clickEvents.forEach(event => {
            const element = event.element + (event.id ? `#${event.id}` : '');
            acc[element] = (acc[element] || 0) + 1;
        });
        return acc;
    }, {});

    console.log('=== Data Summary ===');
    console.log('Unique Visitors:', userLogs.length);
    console.log('Browsers:', browsers);
    console.log('Average Session Duration:', avgSessionDuration, 'seconds');
    console.log('Exercise Frequencies:', exerciseFrequencies);
    console.log('Fitness Goals:', fitnessGoals);
    console.log('Geolocations:', locations);
    console.log('Click Events:', clickSummary);
    console.log('WebRTC IPs:', webrtcLogs.map(log => log.localIp));
}

summarizeData();