const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const turf = require('@turf/turf');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Initial State: 15 Ships in the Strait of Hormuz area
let ships = Array.from({ length: 15 }, (_, i) => ({
    id: `SHIP-${i + 1}`,
    name: `Vessel ${String.fromCharCode(65 + i)}`,
    lat: 26.0 + (Math.random() * 0.5),
    lng: 56.0 + (Math.random() * 0.5),
    speed: 0.0005, // degrees per second
    heading: Math.random() * 360,
    fuel: 100,
    status: 'normal'
}));

let zones = []; // Restricted polygons drawn by Command

// 1 Hz Simulation Loop
setInterval(() => {
    ships = ships.map(ship => {
        if (ship.fuel <= 0) return { ...ship, status: 'Out of Fuel', speed: 0 };

        // 1. Move Ship
        const rad = (ship.heading * Math.PI) / 180;
        let newLat = ship.lat + Math.cos(rad) * ship.speed;
        let newLng = ship.lng + Math.sin(rad) * ship.speed;

        // 2. Check Geofencing (Turf.js)
        let inRestrictedZone = false;
        const shipPoint = turf.point([newLng, newLat]);
        
        zones.forEach(zone => {
            const polygon = turf.polygon([zone.coordinates]);
            if (turf.booleanPointInPolygon(shipPoint, polygon)) {
                inRestrictedZone = true;
            }
        });

        // 3. Fuel Calculation (30% penalty in "bad" conditions)
        // For simplicity, we'll treat restricted zones as "stormy" for fuel math
        const penalty = inRestrictedZone ? 1.3 : 1.0;
        const newFuel = Math.max(0, ship.fuel - (0.005 * penalty));

        return {
            ...ship,
            lat: newLat,
            lng: newLng,
            fuel: newFuel,
            status: inRestrictedZone ? 'CRITICAL: Blockade Zone' : 'normal'
        };
    });

    // 4. Proximity Warnings (Ships within 2km)
    // You would add a Haversine formula check here

    io.emit('fleetUpdate', { ships, zones });
}, 1000);

io.on('connection', (socket) => {
    console.log('User connected to Command');
    
    socket.on('createZone', (newZone) => {
        zones.push(newZone);
        io.emit('zoneUpdate', zones);
    });
});

server.listen(4000, () => console.log('Simulator running on port 4000'));
