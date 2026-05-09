const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Load initial fleet data
let fleet = JSON.parse(fs.readFileSync('./fleet.json', 'utf8'));

// Physics Constants
const TICK_RATE = 1000; // 1 Hz [cite: 10, 45]
const FUEL_CONSUMPTION_BASE = 0.005;
const WEATHER_PENALTY = 1.3; // 30% extra fuel [cite: 14, 47]

function updateSimulator() {
    fleet.forEach(ship => {
        if (ship.status === 'stopped' || ship.fuel <= 0) return;

        // 1. ADVANCE POSITION (Physics) [cite: 46]
        // Converting speed (km/h) and heading to lat/lng changes
        // Roughly: 1 deg lat ≈ 111km. This is a hackathon-friendly approximation.
        const speedPerSecond = (ship.speed / 3600); 
        const rad = (ship.heading * Math.PI) / 180;
        
        ship.lat += (speedPerSecond * Math.cos(rad)) / 111;
        ship.lng += (speedPerSecond * Math.sin(rad)) / 111;

        // 2. FUEL LOGIC [cite: 23, 74]
        // Mocking adverse weather for demo - integrate real API here later
        const isBadWeather = Math.random() > 0.8; 
        const consumption = FUEL_CONSUMPTION_BASE * (isBadWeather ? WEATHER_PENALTY : 1.0);
        
        ship.fuel = Math.max(0, ship.fuel - consumption);
        if (ship.fuel === 0) ship.status = 'stopped';
        
        // Update condition-based status [cite: 48]
        ship.inAdverseWeather = isBadWeather;
    });

    // 3. REAL-TIME SYNC [cite: 11, 48, 62]
    io.emit('fleetUpdate', fleet);
}

// Run the tick every second [cite: 45]
setInterval(updateSimulator, TICK_RATE);

io.on('connection', (socket) => {
    console.log('User connected to Command Center');
    socket.emit('fleetUpdate', fleet); // Send initial state
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
