const { v4: uuid } = require('uuid');

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

class AlertPipeline {
  constructor() {
    this.alerts = new Map();
    this._listeners = [];
  }

  push(alertOrAlerts) {
    const items = Array.isArray(alertOrAlerts) ? alertOrAlerts : [alertOrAlerts];
    for (const alert of items) {
      if (!alert.id) alert.id = uuid();
      if (!alert.timestamp) alert.timestamp = new Date().toISOString();
      alert.acknowledged = alert.acknowledged ?? false;
      alert.resolved = false;
      this.alerts.set(alert.id, alert);
      this._emit(alert);
    }
  }

  acknowledge(alertId, by = 'command') {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;
    alert.acknowledged = true;
    alert.acknowledgedBy = by;
    alert.acknowledgedAt = new Date().toISOString();
    this._emit({ ...alert, _update: true });
    return alert;
  }

  resolve(alertId, by = 'command') {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;
    alert.resolved = true;
    alert.resolvedBy = by;
    alert.resolvedAt = new Date().toISOString();
    this._emit({ ...alert, _update: true });
    return alert;
  }

  getActive() {
    return Array.from(this.alerts.values())
      .filter((a) => !a.resolved)
      .sort((a, b) => {
        const sa = SEVERITY_ORDER[a.severity] ?? 99;
        const sb = SEVERITY_ORDER[b.severity] ?? 99;
        return sa !== sb ? sa - sb : new Date(b.timestamp) - new Date(a.timestamp);
      });
  }

  getAll() {
    return Array.from(this.alerts.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  onAlert(fn) { this._listeners.push(fn); }

  _emit(alert) {
    for (const fn of this._listeners) { try { fn(alert); } catch (_) {} }
  }

  prune() {
    const all = this.getAll();
    if (all.length > 500) {
      for (const a of all.slice(500)) this.alerts.delete(a.id);
    }
  }
}

const alertPipeline = new AlertPipeline();
module.exports = { alertPipeline };