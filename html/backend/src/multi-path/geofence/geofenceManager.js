const { v4: uuid } = require('uuid');
const { pointInPolygon, haversineKm } = require('../geo');

const PROXIMITY_WARN_KM = 2;

class GeofenceManager {
  constructor() {
    this.zones = new Map();
    this.activeBreaches = new Map();
    this.activeProximityWarnings = new Map();
  }

  addZone({ name, polygon, createdBy = 'command' }) {
    const id = uuid();
    const zone = { id, name: name || `Zone-${id.slice(0, 6)}`, polygon, createdBy, createdAt: new Date().toISOString(), active: true };
    this.zones.set(id, zone);
    return zone;
  }

  removeZone(zoneId) {
    if (!this.zones.has(zoneId)) return false;
    this.zones.delete(zoneId);
    for (const breachSet of this.activeBreaches.values()) breachSet.delete(zoneId);
    return true;
  }

  updateZone(zoneId, updates) {
    const zone = this.zones.get(zoneId);
    if (!zone) return null;
    Object.assign(zone, updates);
    return zone;
  }

  getZones() { return Array.from(this.zones.values()); }

  checkBreaches(ships) {
    const newBreaches = [];
    const allZones = this.getZones();
    for (const ship of ships) {
      if (!this.activeBreaches.has(ship.id)) this.activeBreaches.set(ship.id, new Set());
      const shipBreaches = this.activeBreaches.get(ship.id);
      for (const zone of allZones) {
        const inside = pointInPolygon(ship.lat, ship.lng, zone.polygon);
        const wasInside = shipBreaches.has(zone.id);
        if (inside && !wasInside) {
          shipBreaches.add(zone.id);
          newBreaches.push({
            id: uuid(), type: 'GEOFENCE_BREACH',
            shipId: ship.id, shipName: ship.name,
            zoneId: zone.id, zoneName: zone.name,
            lat: ship.lat, lng: ship.lng,
            timestamp: new Date().toISOString(),
            acknowledged: false, severity: 'HIGH',
          });
        } else if (!inside && wasInside) {
          shipBreaches.delete(zone.id);
        }
      }
    }
    return newBreaches;
  }

  checkProximity(ships) {
    const newWarnings = [];
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i], b = ships[j];
        const dist = haversineKm(a.lat, a.lng, b.lat, b.lng);
        const pairKey = [a.id, b.id].sort().join(':');
        if (dist < PROXIMITY_WARN_KM) {
          if (!this.activeProximityWarnings.has(pairKey)) {
            const warning = {
              id: uuid(), type: 'PROXIMITY_WARNING',
              shipAId: a.id, shipAName: a.name,
              shipBId: b.id, shipBName: b.name,
              distanceKm: Math.round(dist * 100) / 100,
              lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2,
              timestamp: new Date().toISOString(),
              acknowledged: false, severity: dist < 0.5 ? 'CRITICAL' : 'HIGH',
            };
            this.activeProximityWarnings.set(pairKey, warning);
            newWarnings.push(warning);
          } else {
            this.activeProximityWarnings.get(pairKey).distanceKm = Math.round(dist * 100) / 100;
          }
        } else {
          this.activeProximityWarnings.delete(pairKey);
        }
      }
    }
    return newWarnings;
  }

  pathConflictsWithZone(path) {
    const { pathIntersectsPolygon } = require('../geo');
    for (const zone of this.zones.values()) {
      if (pathIntersectsPolygon(path, zone.polygon)) return zone;
    }
    return null;
  }

  predictiveBreach(ship, lookAheadSeconds = 180) {
    const { movePoint, KM_PER_KNOT } = require('../geo');
    const distKm = ship.speed * KM_PER_KNOT * (lookAheadSeconds / 3600);
    const futurePt = movePoint(ship.lat, ship.lng, ship.heading, distKm);
    for (const zone of this.zones.values()) {
      if (!pointInPolygon(ship.lat, ship.lng, zone.polygon) &&
           pointInPolygon(futurePt.lat, futurePt.lng, zone.polygon)) {
        return {
          type: 'PREDICTIVE_BREACH', shipId: ship.id, shipName: ship.name,
          zoneId: zone.id, zoneName: zone.name,
          estimatedSecondsUntilBreach: lookAheadSeconds,
          timestamp: new Date().toISOString(), severity: 'MEDIUM',
        };
      }
    }
    return null;
  }
}

module.exports = { GeofenceManager };