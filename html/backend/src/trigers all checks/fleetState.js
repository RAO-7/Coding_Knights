const { v4: uuid } = require('uuid');
const fleetData = require('../../data/fleet.json');
const { haversineKm, estimatedRangeKm } = require('../geo');

const STATUSES = {
  NORMAL: 'normal', REROUTING: 'rerouting', DISTRESSED: 'distressed',
  STOPPED: 'stopped', STRANDED: 'stranded', ARRIVED: 'arrived',
  INSUFFICIENT_FUEL: 'insufficient_fuel', OUT_OF_FUEL: 'out_of_fuel',
};

class FleetState {
  constructor() {
    this.ships = new Map();
    this.ports = new Map();
    this.directives = new Map();
    this.distressCalls = new Map();
    this._initFleet();
  }

  _initFleet() {
    for (const port of fleetData.ports) this.ports.set(port.id, port);
    for (const s of fleetData.ships) {
      const destPort = this.ports.get(s.destination);
      this.ships.set(s.id, {
        id: s.id, name: s.name, lat: s.lat, lng: s.lng,
        speed: s.speed, heading: s.heading,
        destination: s.destination,
        destinationName: destPort?.name || s.destination,
        destLat: destPort?.lat, destLng: destPort?.lng,
        fuel: s.fuel, maxFuel: s.maxFuel,
        cargo: s.cargo, type: s.type, flag: s.flag,
        status: STATUSES.NORMAL,
        route: [], routeIndex: 0,
        inAdverseWeather: false, weather: null,
        distressHistory: [], lastUpdated: Date.now(),
      });
    }
  }

  getShip(id) { return this.ships.get(id) || null; }
  getAllShips() { return Array.from(this.ships.values()); }
  updateShip(id, patch) {
    const ship = this.ships.get(id);
    if (!ship) return null;
    Object.assign(ship, patch, { lastUpdated: Date.now() });
    return ship;
  }

  issueDirective({ shipId, type, payload, issuedBy = 'command' }) {
    const ship = this.ships.get(shipId);
    if (!ship) throw new Error(`Ship ${shipId} not found`);
    const directive = {
      id: uuid(), shipId, shipName: ship.name, type, payload,
      issuedBy, issuedAt: new Date().toISOString(),
      status: 'PENDING', captainResponse: null,
    };
    this.directives.set(directive.id, directive);
    return directive;
  }

  respondToDirective(directiveId, response, opts = {}) {
    const directive = this.directives.get(directiveId);
    if (!directive) throw new Error(`Directive ${directiveId} not found`);
    if (directive.status !== 'PENDING') throw new Error('Directive already responded to');
    directive.status = response === 'ACCEPT' ? 'ACCEPTED' : 'ESCALATED';
    directive.captainResponse = response;
    directive.respondedAt = new Date().toISOString();
    if (response === 'ACCEPT') this._applyDirective(directive);
    return directive;
  }

  _applyDirective(directive) {
    const ship = this.ships.get(directive.shipId);
    if (!ship) return;
    switch (directive.type) {
      case 'REROUTE': {
        const port = this.ports.get(directive.payload.newDestination);
        if (port) {
          ship.destination = directive.payload.newDestination;
          ship.destinationName = port.name;
          ship.destLat = port.lat; ship.destLng = port.lng;
          ship.route = []; ship.routeIndex = 0;
          ship.status = STATUSES.REROUTING;
        }
        break;
      }
      case 'DIVERT_WAYPOINT':
        ship.route = [directive.payload.waypoint, ...(ship.route || [])];
        ship.routeIndex = 0; ship.status = STATUSES.REROUTING;
        break;
      case 'HOLD_POSITION':
        ship.speed = 0; ship.status = STATUSES.STOPPED;
        break;
      case 'CHANGE_SPEED':
        ship.speed = directive.payload.speed;
        break;
      case 'RESUME':
        ship.speed = directive.payload.speed || 12;
        if (ship.status === STATUSES.STOPPED) ship.status = STATUSES.NORMAL;
        break;
    }
  }

  getPendingDirectivesForShip(shipId) {
    return Array.from(this.directives.values()).filter(
      (d) => d.shipId === shipId && d.status === 'PENDING'
    );
  }

  getAllDirectives() {
    return Array.from(this.directives.values())
      .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
  }

  recordDistressCall({ shipId, message, analysis }) {
    const ship = this.ships.get(shipId);
    if (!ship) return null;
    const distress = {
      id: uuid(), shipId, shipName: ship.name, message, analysis,
      timestamp: new Date().toISOString(), resolved: false,
    };
    this.distressCalls.set(distress.id, distress);
    ship.distressHistory.push(distress.id);
    ship.status = STATUSES.DISTRESSED;
    return distress;
  }

  resolveDistress(distressId) {
    const d = this.distressCalls.get(distressId);
    if (d) { d.resolved = true; d.resolvedAt = new Date().toISOString(); }
    return d;
  }

  getActiveDistressCalls() {
    return Array.from(this.distressCalls.values()).filter((d) => !d.resolved);
  }

  requestAssistance({ fromShipId, toShipId, assistanceType, details }) {
    const from = this.ships.get(fromShipId);
    const to = this.ships.get(toShipId);
    if (!from || !to) throw new Error('Ship not found');
    const req = {
      id: uuid(),
      fromShipId, fromShipName: from.name,
      toShipId, toShipName: to.name,
      assistanceType, details,
      status: 'PENDING', requestedAt: new Date().toISOString(),
    };
    from._outboundAssistance = req;
    to._inboundAssistance = req;
    return req;
  }

  checkFuelSufficiency(ship) {
    if (!ship.destLat) return null;
    const distToDestKm = haversineKm(ship.lat, ship.lng, ship.destLat, ship.destLng);
    const rangeKm = estimatedRangeKm(ship.fuel, ship.inAdverseWeather);
    return {
      distToDestKm: Math.round(distToDestKm),
      estimatedRangeKm: Math.round(rangeKm),
      canReach: rangeKm >= distToDestKm,
      shortfallKm: Math.max(0, Math.round(distToDestKm - rangeKm)),
    };
  }
}

const fleetState = new FleetState();
module.exports = { fleetState, STATUSES };