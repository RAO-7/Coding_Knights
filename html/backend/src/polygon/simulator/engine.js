const { fleetState, STATUSES } = require('./fleetState');
const { GeofenceManager } = require('../geofence/geofenceManager');
const { alertPipeline } = require('../geofence/alertPipeline');
const { weatherService } = require('../weather/weatherService');
const { findPath } = require('../routing/router');
const { haversineKm, bearingDeg, movePoint, fuelBurnPerKm, KM_PER_KNOT } = require('../geo');
const { playbackStore } = require('../playback/store');

const TICK_MS = parseInt(process.env.TICK_RATE_MS) || 1000;
const TICK_S  = TICK_MS / 1000;
const ARRIVE_KM = 1.0;

let tickCount = 0;
let simulatorInterval = null;
const geofenceManager = new GeofenceManager();

function getGeofenceManager() { return geofenceManager; }

async function tick(wss) {
  tickCount++;
  const ships = fleetState.getAllShips();

  // Weather refresh every 30 ticks
  if (tickCount % 30 === 1) weatherService.updateAllShips(ships).catch(() => {});

  // Compute routes for unrouted ships
  for (const ship of ships) {
    if (
      ship.status !== STATUSES.ARRIVED && ship.status !== STATUSES.STOPPED &&
      ship.status !== STATUSES.STRANDED && ship.status !== STATUSES.OUT_OF_FUEL &&
      (!ship.route || ship.route.length === 0) && ship.destLat != null
    ) computeRoute(ship);
  }

  // Advance each ship
  for (const ship of ships) {
    if ([STATUSES.ARRIVED, STATUSES.STRANDED, STATUSES.OUT_OF_FUEL].includes(ship.status)) continue;
    if (ship.speed === 0) continue;

    const weather = weatherService.getShipWeather(ship.id);
    ship.inAdverseWeather = weather?.isAdverse ?? false;
    ship.weather = weather;

    const distKm = ship.speed * KM_PER_KNOT * (TICK_S / 3600);
    ship.fuel = Math.max(0, ship.fuel - fuelBurnPerKm(ship.inAdverseWeather) * distKm);

    if (ship.fuel === 0) {
      ship.status = STATUSES.OUT_OF_FUEL;
      alertPipeline.push({ type: 'FUEL_EMPTY', shipId: ship.id, shipName: ship.name, severity: 'CRITICAL', message: `${ship.name} has run out of fuel` });
      continue;
    }

    advanceAlongRoute(ship, distKm);

    const fc = fleetState.checkFuelSufficiency(ship);
    if (fc && !fc.canReach && ship.status !== STATUSES.INSUFFICIENT_FUEL) {
      ship.status = STATUSES.INSUFFICIENT_FUEL;
      alertPipeline.push({ type: 'FUEL_INSUFFICIENT', shipId: ship.id, shipName: ship.name, severity: 'HIGH', message: `${ship.name} cannot reach ${ship.destinationName} — ${fc.shortfallKm} km short`, ...fc });
    }
  }

  // Breach detection
  const breaches = geofenceManager.checkBreaches(ships);
  if (breaches.length) {
    alertPipeline.push(breaches);
    for (const b of breaches) {
      const ship = fleetState.getShip(b.shipId);
      if (ship && ship.status !== STATUSES.STRANDED) {
        ship.status = STATUSES.REROUTING;
        computeRoute(ship);
      }
    }
  }

  // Proximity warnings
  const proximityWarnings = geofenceManager.checkProximity(ships);
  if (proximityWarnings.length) alertPipeline.push(proximityWarnings);

  // Predictive breach every 10 ticks
  if (tickCount % 10 === 0) {
    for (const ship of ships) {
      if ([STATUSES.NORMAL, STATUSES.REROUTING].includes(ship.status)) {
        const pred = geofenceManager.predictiveBreach(ship, 180);
        if (pred) {
          const key = `pred:${ship.id}:${pred.zoneId}`;
          if (!alertPipeline.alerts.has(key)) alertPipeline.push({ ...pred, id: key });
        }
      }
    }
  }

  // Playback snapshot every 30 ticks
  if (tickCount % 30 === 0) playbackStore.saveSnapshot(ships, alertPipeline.getActive());

  // Broadcast
  const payload = buildStatePayload(ships);
  broadcast(wss, { type: 'FLEET_STATE', payload });

  if (tickCount % 100 === 0) alertPipeline.prune();
}

function advanceAlongRoute(ship, distKm) {
  if (!ship.route || ship.route.length === 0) {
    if (!ship.destLat) return;
    const bearing = bearingDeg(ship.lat, ship.lng, ship.destLat, ship.destLng);
    ship.heading = bearing;
    const pt = movePoint(ship.lat, ship.lng, bearing, distKm);
    ship.lat = pt.lat; ship.lng = pt.lng;
    if (haversineKm(ship.lat, ship.lng, ship.destLat, ship.destLng) < ARRIVE_KM) {
      ship.status = STATUSES.ARRIVED; ship.lat = ship.destLat; ship.lng = ship.destLng;
    }
    return;
  }

  let remaining = distKm;
  while (remaining > 0 && ship.routeIndex < ship.route.length) {
    const wp = ship.route[ship.routeIndex];
    const distToWp = haversineKm(ship.lat, ship.lng, wp.lat, wp.lng);
    const bearing = bearingDeg(ship.lat, ship.lng, wp.lat, wp.lng);
    ship.heading = bearing;
    if (remaining >= distToWp) {
      ship.lat = wp.lat; ship.lng = wp.lng;
      remaining -= distToWp; ship.routeIndex++;
    } else {
      const pt = movePoint(ship.lat, ship.lng, bearing, remaining);
      ship.lat = pt.lat; ship.lng = pt.lng;
      remaining = 0;
    }
  }

  if (ship.routeIndex >= ship.route.length && ship.destLat != null) {
    if (haversineKm(ship.lat, ship.lng, ship.destLat, ship.destLng) < ARRIVE_KM) {
      ship.status = STATUSES.ARRIVED; ship.lat = ship.destLat; ship.lng = ship.destLng;
    }
  }
}

function computeRoute(ship) {
  if (!ship.destLat) return;
  const path = findPath({ lat: ship.lat, lng: ship.lng }, { lat: ship.destLat, lng: ship.destLng }, geofenceManager.getZones());
  if (path) {
    ship.route = path; ship.routeIndex = 0;
    if (ship.status === STATUSES.REROUTING) ship.status = STATUSES.NORMAL;
  } else {
    ship.status = STATUSES.STRANDED;
    alertPipeline.push({ type: 'STRANDED', shipId: ship.id, shipName: ship.name, severity: 'CRITICAL', message: `${ship.name} is stranded — no valid path to ${ship.destinationName}` });
  }
}

function buildStatePayload(ships) {
  return {
    ships: ships.map(serializeShip),
    zones: geofenceManager.getZones(),
    activeAlerts: alertPipeline.getActive().slice(0, 50),
    tickCount,
    serverTime: new Date().toISOString(),
  };
}

function serializeShip(s) {
  return {
    id: s.id, name: s.name,
    lat: Math.round(s.lat * 100000) / 100000,
    lng: Math.round(s.lng * 100000) / 100000,
    speed: s.speed, heading: s.heading,
    destination: s.destination, destinationName: s.destinationName,
    fuel: Math.round(s.fuel * 10) / 10,
    cargo: s.cargo, type: s.type, flag: s.flag,
    status: s.status, inAdverseWeather: s.inAdverseWeather,
    weatherDesc: s.weather?.description || null,
    route: s.route?.slice(0, 100) || [], routeIndex: s.routeIndex,
    lastUpdated: s.lastUpdated,
  };
}

function broadcast(wss, msg) {
  if (!wss) return;
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { try { client.send(data); } catch (_) {} }
  });
}

function startSimulator(wss) {
  if (simulatorInterval) return;
  console.log(`[Simulator] Starting at ${1000 / TICK_MS} Hz`);
  simulatorInterval = setInterval(() => tick(wss).catch(console.error), TICK_MS);
}

function stopSimulator() {
  if (simulatorInterval) { clearInterval(simulatorInterval); simulatorInterval = null; }
}

module.exports = { startSimulator, stopSimulator, getGeofenceManager, computeRoute, buildStatePayload, serializeShip };