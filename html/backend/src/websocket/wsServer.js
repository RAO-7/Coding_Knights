const { WebSocketServer } = require('ws');
const { fleetState, STATUSES } = require('../simulator/fleetState');
const { alertPipeline } = require('../geofence/alertPipeline');
const { analyseDistress, getFleetAdvice } = require('../ai/aiService');
const { getGeofenceManager, buildStatePayload, computeRoute } = require('../simulator/engine');
const { findMultiplePaths } = require('../routing/router');
const { playbackStore } = require('../playback/store');

const COMMAND_TOKEN  = process.env.COMMAND_TOKEN  || 'command-secret';
const CAPTAIN_PREFIX = process.env.CAPTAIN_PREFIX || 'captain-';

function resolveRole(token) {
  if (!token) return null;
  if (token === COMMAND_TOKEN) return { role: 'command' };
  if (token.startsWith(CAPTAIN_PREFIX)) {
    const shipId = token.slice(CAPTAIN_PREFIX.length).toUpperCase();
    if (fleetState.getShip(shipId)) return { role: 'captain', shipId };
  }
  return null;
}

function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  alertPipeline.onAlert((alert) => {
    broadcast(wss, { type: 'ALERT', payload: alert }, (c) => c._auth?.role === 'command');
    if (alert.shipId) {
      broadcast(wss, { type: 'ALERT', payload: alert },
        (c) => c._auth?.role === 'captain' && c._auth?.shipId === alert.shipId);
    }
  });

  wss.on('connection', (ws, req) => {
    ws._auth = null;
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return send(ws, { type: 'ERROR', message: 'Invalid JSON' }); }
      await handleMessage(ws, wss, msg);
    });
    ws.on('error', () => {});
    send(ws, { type: 'HELLO', message: 'Send AUTH message to authenticate' });
  });

  return wss;
}

async function handleMessage(ws, wss, msg) {
  const { type } = msg;
  const gm = getGeofenceManager();

  if (type === 'AUTH') {
    const auth = resolveRole(msg.token);
    if (!auth) return send(ws, { type: 'ERROR', message: 'Invalid token' });
    ws._auth = auth;
    send(ws, { type: 'AUTH_OK', ...auth });
    send(ws, { type: 'FLEET_STATE', payload: buildStatePayload(fleetState.getAllShips()) });
    return;
  }

  if (!ws._auth) return send(ws, { type: 'ERROR', message: 'Not authenticated' });
  const { role, shipId: captainShipId } = ws._auth;

  // Command messages
  if (type === 'DRAW_ZONE') {
    if (role !== 'command') return send(ws, { type: 'ERROR', message: 'Forbidden' });
    const zone = gm.addZone({ name: msg.name, polygon: msg.polygon });
    for (const ship of fleetState.getAllShips()) {
      if ([STATUSES.ARRIVED, STATUSES.STRANDED].includes(ship.status)) continue;
      if (gm.pathConflictsWithZone(ship.route || [])) {
        ship.status = STATUSES.REROUTING;
        computeRoute(ship);
      }
    }
    broadcastAll(wss, { type: 'ZONE_ADDED', payload: zone });
    return;
  }

  if (type === 'DELETE_ZONE') {
    if (role !== 'command') return send(ws, { type: 'ERROR', message: 'Forbidden' });
    gm.removeZone(msg.zoneId);
    broadcastAll(wss, { type: 'ZONE_REMOVED', payload: { zoneId: msg.zoneId } });
    return;
  }

  if (type === 'ISSUE_DIRECTIVE') {
    if (role !== 'command') return send(ws, { type: 'ERROR', message: 'Forbidden' });
    try {
      const directive = fleetState.issueDirective({ shipId: msg.shipId, type: msg.directiveType, payload: msg.payload || {} });
      broadcastAll(wss, { type: 'DIRECTIVE', payload: directive });
    } catch (err) { send(ws, { type: 'ERROR', message: err.message }); }
    return;
  }

  if (type === 'REQUEST_MULTIPLE_ROUTES') {
    if (role !== 'command') return send(ws, { type: 'ERROR', message: 'Forbidden' });
    const ship = fleetState.getShip(msg.shipId);
    if (!ship) return send(ws, { type: 'ERROR', message: 'Ship not found' });
    const candidates = findMultiplePaths({ lat: ship.lat, lng: ship.lng }, { lat: ship.destLat, lng: ship.destLng }, gm.getZones());
    send(ws, { type: 'ROUTE_OPTIONS', payload: { shipId: msg.shipId, candidates } });
    return;
  }

  if (type === 'SELECT_ROUTE') {
    if (role !== 'command') return send(ws, { type: 'ERROR', message: 'Forbidden' });
    const ship = fleetState.getShip(msg.shipId);
    if (!ship || !msg.path) return send(ws, { type: 'ERROR', message: 'Invalid' });
    ship.route = msg.path; ship.routeIndex = 0; ship.status = STATUSES.REROUTING;
    broadcastAll(wss, { type: 'ROUTE_SELECTED', payload: { shipId: msg.shipId } });
    return;
  }

  if (type === 'ACK_ALERT') {
    const alert = alertPipeline.acknowledge(msg.alertId, role);
    if (alert) broadcastAll(wss, { type: 'ALERT_UPDATED', payload: alert });
    return;
  }

  if (type === 'RESOLVE_ALERT') {
    const alert = alertPipeline.resolve(msg.alertId, role);
    if (alert) broadcastAll(wss, { type: 'ALERT_UPDATED', payload: alert });
    return;
  }

  if (type === 'REQUEST_FLEET_ADVICE') {
    if (role !== 'command') return send(ws, { type: 'ERROR', message: 'Forbidden' });
    const advice = await getFleetAdvice(fleetState.getAllShips(), alertPipeline.getActive(), gm.getZones());
    send(ws, { type: 'FLEET_ADVICE', payload: advice });
    return;
  }

  // Captain messages
  if (type === 'CAPTAIN_RESPONSE') {
    if (role !== 'captain') return send(ws, { type: 'ERROR', message: 'Forbidden' });
    try {
      const directive = fleetState.respondToDirective(msg.directiveId, msg.response, { distressMessage: msg.distressMessage });
      broadcastAll(wss, { type: 'DIRECTIVE_RESPONSE', payload: directive });
      if (msg.response === 'ESCALATE_DISTRESS' && msg.distressMessage) {
        const ship = fleetState.getShip(directive.shipId);
        const analysis = await analyseDistress(msg.distressMessage, ship);
        const distress = fleetState.recordDistressCall({ shipId: directive.shipId, message: msg.distressMessage, analysis });
        alertPipeline.push({ type: 'DISTRESS', shipId: directive.shipId, shipName: ship.name, severity: analysis.severity, message: msg.distressMessage, analysis });
        broadcastAll(wss, { type: 'DISTRESS_ANALYSIS', payload: distress });
      }
    } catch (err) { send(ws, { type: 'ERROR', message: err.message }); }
    return;
  }

  if (type === 'DISTRESS') {
    if (role !== 'captain') return send(ws, { type: 'ERROR', message: 'Forbidden' });
    const shipId = captainShipId || msg.shipId;
    const ship = fleetState.getShip(shipId);
    if (!ship) return send(ws, { type: 'ERROR', message: 'Ship not found' });
    const analysis = await analyseDistress(msg.message, ship);
    const distress = fleetState.recordDistressCall({ shipId, message: msg.message, analysis });
    alertPipeline.push({ type: 'DISTRESS', shipId, shipName: ship.name, severity: analysis.severity, message: msg.message, analysis });
    broadcastAll(wss, { type: 'DISTRESS_ANALYSIS', payload: distress });
    send(ws, { type: 'DISTRESS_RECEIVED', payload: distress });
    return;
  }

  if (type === 'REQUEST_SHIP_ASSISTANCE') {
    const shipId = captainShipId || msg.fromShipId;
    try {
      const req = fleetState.requestAssistance({ fromShipId: shipId, toShipId: msg.toShipId, assistanceType: msg.assistanceType, details: msg.details });
      broadcastAll(wss, { type: 'ASSISTANCE_REQUEST', payload: req });
    } catch (err) { send(ws, { type: 'ERROR', message: err.message }); }
    return;
  }

  if (type === 'RESPOND_ASSISTANCE') {
    broadcastAll(wss, { type: 'ASSISTANCE_RESPONSE', payload: { ...msg, respondedAt: new Date().toISOString() } });
    return;
  }

  if (type === 'GET_PLAYBACK') {
    send(ws, { type: 'PLAYBACK_DATA', payload: playbackStore.getSnapshots(msg.fromTs, msg.toTs) });
    return;
  }

  send(ws, { type: 'ERROR', message: `Unknown message type: ${type}` });
}

function send(ws, msg) {
  if (ws.readyState === 1) { try { ws.send(JSON.stringify(msg)); } catch (_) {} }
}

function broadcast(wss, msg, filter) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && (!filter || filter(client))) {
      try { client.send(data); } catch (_) {}
    }
  });
}

function broadcastAll(wss, msg) { broadcast(wss, msg); }

module.exports = { createWebSocketServer };