const express = require('express');
const router  = express.Router();
const { fleetState } = require('../simulator/fleetState');
const { alertPipeline } = require('../geofence/alertPipeline');
const { playbackStore } = require('../playback/store');
const { weatherService } = require('../weather/weatherService');
const { getGeofenceManager, buildStatePayload, serializeShip } = require('../simulator/engine');
const { findMultiplePaths } = require('../routing/router');
const { analyseDistress, getFleetAdvice } = require('../ai/aiService');
const { haversineKm } = require('../geo');

const COMMAND_TOKEN  = process.env.COMMAND_TOKEN  || 'command-secret';
const CAPTAIN_PREFIX = process.env.CAPTAIN_PREFIX || 'captain-';

function authMiddleware(req, res, next) {
  const token = req.headers['x-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Missing X-Token header' });
  if (token === COMMAND_TOKEN) { req.role = 'command'; return next(); }
  if (token.startsWith(CAPTAIN_PREFIX)) {
    const shipId = token.slice(CAPTAIN_PREFIX.length).toUpperCase();
    if (fleetState.getShip(shipId)) { req.role = 'captain'; req.captainShipId = shipId; return next(); }
  }
  return res.status(403).json({ error: 'Invalid token' });
}

function requireCommand(req, res, next) {
  if (req.role !== 'command') return res.status(403).json({ error: 'Command role required' });
  next();
}

router.use(authMiddleware);

router.get('/fleet', (req, res) => res.json(buildStatePayload(fleetState.getAllShips())));
router.get('/ships', (req, res) => res.json(fleetState.getAllShips().map(serializeShip)));
router.get('/ships/:id', (req, res) => {
  const ship = fleetState.getShip(req.params.id.toUpperCase());
  if (!ship) return res.status(404).json({ error: 'Ship not found' });
  if (req.role === 'captain' && req.captainShipId !== ship.id) return res.status(403).json({ error: 'Not your ship' });
  res.json({ ...serializeShip(ship), fuelSufficiency: fleetState.checkFuelSufficiency(ship), pendingDirectives: fleetState.getPendingDirectivesForShip(ship.id), weather: weatherService.getShipWeather(ship.id) });
});

router.get('/zones', (req, res) => res.json(getGeofenceManager().getZones()));
router.post('/zones', requireCommand, (req, res) => {
  const { name, polygon } = req.body;
  if (!polygon || !Array.isArray(polygon)) return res.status(400).json({ error: 'polygon required' });
  res.status(201).json(getGeofenceManager().addZone({ name, polygon }));
});
router.delete('/zones/:id', requireCommand, (req, res) => {
  const ok = getGeofenceManager().removeZone(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Zone not found' });
  res.json({ deleted: req.params.id });
});

router.get('/directives', (req, res) => {
  const all = fleetState.getAllDirectives();
  res.json(req.role === 'captain' ? all.filter((d) => d.shipId === req.captainShipId) : all);
});
router.post('/directives', requireCommand, (req, res) => {
  try { res.status(201).json(fleetState.issueDirective({ shipId: req.body.shipId, type: req.body.type, payload: req.body.payload || {} })); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.post('/directives/:id/respond', (req, res) => {
  if (req.role !== 'captain') return res.status(403).json({ error: 'Captain role required' });
  try { res.json(fleetState.respondToDirective(req.params.id, req.body.response, { distressMessage: req.body.distressMessage })); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/distress', async (req, res) => {
  if (req.role !== 'captain') return res.status(403).json({ error: 'Captain role required' });
  const shipId = req.captainShipId || req.body.shipId;
  const ship = fleetState.getShip(shipId);
  if (!ship) return res.status(404).json({ error: 'Ship not found' });
  const analysis = await analyseDistress(req.body.message, ship);
  const distress = fleetState.recordDistressCall({ shipId, message: req.body.message, analysis });
  alertPipeline.push({ type: 'DISTRESS', shipId, shipName: ship.name, severity: analysis.severity, message: req.body.message, analysis });
  res.status(201).json(distress);
});
router.get('/distress', (req, res) => res.json(fleetState.getActiveDistressCalls()));

router.get('/alerts', (req, res) => res.json(alertPipeline.getActive()));
router.post('/alerts/:id/ack', (req, res) => {
  const alert = alertPipeline.acknowledge(req.params.id, req.role);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});
router.post('/alerts/:id/resolve', (req, res) => {
  const alert = alertPipeline.resolve(req.params.id, req.role);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

router.get('/weather', (req, res) => res.json(weatherService.getAllWeather()));
router.get('/weather/:shipId', (req, res) => res.json(weatherService.getShipWeather(req.params.shipId.toUpperCase())));

router.get('/routes/:shipId', requireCommand, (req, res) => {
  const ship = fleetState.getShip(req.params.shipId.toUpperCase());
  if (!ship) return res.status(404).json({ error: 'Ship not found' });
  res.json({ shipId: ship.id, candidates: findMultiplePaths({ lat: ship.lat, lng: ship.lng }, { lat: ship.destLat, lng: ship.destLng }, getGeofenceManager().getZones()) });
});

router.get('/playback/timeline', (req, res) => res.json(playbackStore.getTimeline()));
router.get('/playback', (req, res) => res.json(playbackStore.getSnapshots(req.query.from, req.query.to)));

router.get('/ai/advice', requireCommand, async (req, res) => {
  res.json(await getFleetAdvice(fleetState.getAllShips(), alertPipeline.getActive(), getGeofenceManager().getZones()));
});

router.get('/proximity', (req, res) => {
  const ships = fleetState.getAllShips();
  const pairs = [];
  for (let i = 0; i < ships.length; i++)
    for (let j = i + 1; j < ships.length; j++) {
      const dist = haversineKm(ships[i].lat, ships[i].lng, ships[j].lat, ships[j].lng);
      if (dist < 10) pairs.push({ shipA: ships[i].id, shipAName: ships[i].name, shipB: ships[j].id, shipBName: ships[j].name, distanceKm: Math.round(dist * 100) / 100 });
    }
  res.json(pairs.sort((a, b) => a.distanceKm - b.distanceKm));
});

router.get('/ports', (req, res) => res.json(Array.from(fleetState.ports.values())));

module.exports = router;