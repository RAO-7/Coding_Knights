/* ============================================================
   NAUTILUS — Fleet Command Operations
   Frontend Application Logic
   ============================================================ */

'use strict';

// ============================================================
// FLEET DATA — 15 Ships in Strait of Hormuz
// ============================================================
const FLEET_CONFIG = [
  { id: 'SHP-001', name: 'MV ATLAS CROWN',    lat: 26.60, lng: 56.25, heading: 270, speed: 14.2, fuel: 87, dest: 'Bandar Abbas', cargo: 'Crude Oil (280,000 MT)', status: 'normal' },
  { id: 'SHP-002', name: 'MV PERSIAN STAR',   lat: 26.45, lng: 56.80, heading: 285, speed: 12.8, fuel: 62, dest: 'Fujairah',     cargo: 'LNG (150,000 MT)', status: 'normal' },
  { id: 'SHP-003', name: 'MV GULF TITAN',     lat: 26.72, lng: 56.50, heading: 260, speed: 11.5, fuel: 43, dest: 'Dubai Port',   cargo: 'Container Goods', status: 'rerouting' },
  { id: 'SHP-004', name: 'MV HORIZON QUEST',  lat: 26.30, lng: 57.10, heading: 275, speed: 15.0, fuel: 91, dest: 'Muscat',       cargo: 'Dry Bulk (110,000 MT)', status: 'normal' },
  { id: 'SHP-005', name: 'MV IRON MERIDIAN',  lat: 26.55, lng: 56.00, heading: 90,  speed: 13.1, fuel: 28, dest: 'Kuwait City',  cargo: 'Vehicle Carriers', status: 'distressed' },
  { id: 'SHP-006', name: 'MV OMAN SPIRIT',    lat: 26.80, lng: 57.30, heading: 250, speed: 10.3, fuel: 74, dest: 'Fujairah',     cargo: 'Chemicals (45,000 MT)', status: 'normal' },
  { id: 'SHP-007', name: 'MV ZEUS CARRIER',   lat: 26.20, lng: 56.70, heading: 300, speed: 16.2, fuel: 55, dest: 'Bandar Abbas', cargo: 'Crude Oil (200,000 MT)', status: 'normal' },
  { id: 'SHP-008', name: 'MV CORAL PASSAGE',  lat: 26.65, lng: 57.00, heading: 270, speed: 9.8,  fuel: 80, dest: 'Abu Dhabi',    cargo: 'Livestock & Feed', status: 'normal' },
  { id: 'SHP-009', name: 'MV DELTA CURRENT',  lat: 26.40, lng: 56.40, heading: 290, speed: 14.5, fuel: 34, dest: 'Dubai Port',   cargo: 'Electronics (Containers)', status: 'rerouting' },
  { id: 'SHP-010', name: 'MV NOVA TRADER',    lat: 26.75, lng: 56.15, heading: 95,  speed: 12.0, fuel: 69, dest: 'Kuwait City',  cargo: 'Refined Fuel Products', status: 'normal' },
  { id: 'SHP-011', name: 'MV STRAIT RUNNER',  lat: 26.50, lng: 57.50, heading: 265, speed: 17.1, fuel: 93, dest: 'Muscat',       cargo: 'General Cargo', status: 'normal' },
  { id: 'SHP-012', name: 'MV DAWN PHOENIX',   lat: 26.25, lng: 56.60, heading: 310, speed: 11.8, fuel: 51, dest: 'Bandar Abbas', cargo: 'LPG (80,000 MT)', status: 'stopped' },
  { id: 'SHP-013', name: 'MV AEGIS HAULER',   lat: 26.85, lng: 57.10, heading: 245, speed: 13.7, fuel: 77, dest: 'Abu Dhabi',    cargo: 'Steel & Metal (60,000 MT)', status: 'normal' },
  { id: 'SHP-014', name: 'MV SUMMIT VOYAGER', lat: 26.35, lng: 57.40, heading: 280, speed: 10.9, fuel: 22, dest: 'Fujairah',     cargo: 'Food Commodities', status: 'normal' },
  { id: 'SHP-015', name: 'MV ORION PASSAGE',  lat: 26.60, lng: 56.90, heading: 270, speed: 14.8, fuel: 61, dest: 'Dubai Port',   cargo: 'Mixed Containers', status: 'normal' },
];

const PORTS = {
  'Bandar Abbas':  { lat: 27.18, lng: 56.27 },
  'Fujairah':      { lat: 25.13, lng: 56.33 },
  'Dubai Port':    { lat: 25.24, lng: 55.32 },
  'Muscat':        { lat: 23.58, lng: 58.59 },
  'Kuwait City':   { lat: 29.37, lng: 47.98 },
  'Abu Dhabi':     { lat: 24.47, lng: 54.37 },
};

// ============================================================
// APP STATE
// ============================================================
const state = {
  role: null,            // 'command' | 'captain'
  captainShipId: null,
  ships: [],
  alerts: [],
  commsLog: [],
  zones: [],
  selectedShipId: null,
  fleetFilter: 'all',
  fleetSearch: '',
  weatherData: null,
  playbackMode: false,
  pbPosition: 120,       // 0–120 (30s steps = last hour)
  pbHistory: [],
  muted: false,
  drawingZone: false,
  zonePoints: [],
  zonePolyline: null,
  zoneTempMarkers: [],
  pendingZone: null,
  weatherOverlayOn: false,
  proximityRingsOn: false,
  alertCount: 0,
  distressCount: 0,
  tick: 0,
};

let map, ws, shipMarkers = {}, routeLines = {}, zoneLayers = [], weatherLayer = null;
let proximityWarnings = new Set();
let pendingDirectives = {};  // shipId -> [directives]
let historyBuffer = [];       // ring buffer for playback

// ============================================================
// BOOT SEQUENCE
// ============================================================
const BOOT_MESSAGES = [
  'Loading navigational database...',
  'Syncing satellite uplink...',
  'Initializing WebSocket relay...',
  'Fetching fleet telemetry...',
  'Calibrating geofence engine...',
  'Starting AI analysis subsystem...',
  'Connecting weather feeds...',
  'Initializing proximity sensors...',
  'Loading AIS transponder data...',
  'System integrity check: PASS',
];

function boot() {
  const fill = document.getElementById('boot-fill');
  const status = document.getElementById('boot-status');
  const lines = document.getElementById('boot-lines');
  let progress = 0;
  let msgIdx = 0;

  const interval = setInterval(() => {
    progress += Math.random() * 12 + 4;
    if (progress > 100) progress = 100;
    fill.style.width = progress + '%';

    if (msgIdx < BOOT_MESSAGES.length) {
      status.textContent = BOOT_MESSAGES[msgIdx].toUpperCase();
      const line = document.createElement('div');
      line.textContent = `[${new Date().toISOString().slice(11,19)}] ${BOOT_MESSAGES[msgIdx]}`;
      lines.appendChild(line);
      if (lines.children.length > 8) lines.removeChild(lines.firstChild);
      msgIdx++;
    }

    if (progress >= 100) {
      clearInterval(interval);
      status.textContent = 'SYSTEM READY — SELECT ROLE';
      setTimeout(() => {
        document.getElementById('boot-role-select').style.display = 'block';
        populateCaptainSelect();
      }, 600);
    }
  }, 280);
}

function populateCaptainSelect() {
  const sel = document.getElementById('captain-ship-select');
  FLEET_CONFIG.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.id} — ${s.name}`;
    sel.appendChild(opt);
  });
}

function selectRole(role) {
  if (role === 'captain') {
    document.getElementById('boot-role-ship').style.display = 'block';
  } else {
    state.role = 'command';
    launchApp();
  }
}

function confirmCaptain() {
  const sel = document.getElementById('captain-ship-select');
  state.role = 'captain';
  state.captainShipId = sel.value;
  launchApp();
}

function launchApp() {
  document.getElementById('boot-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('app').style.flexDirection = 'column';
  document.getElementById('app').style.height = '100vh';

  initTopbar();
  initMap();
  initFleet();
  initSimulator();
  connectWebSocket();
  initWeather();
  startClock();

  // Role-based UI
  if (state.role === 'captain') {
    document.getElementById('topbar-role').textContent = 'CAPTAIN';
    document.querySelectorAll('.command-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.captain-only').forEach(el => el.style.display = 'block');
    document.getElementById('zone-draw-btn').style.display = 'none';
    // Auto-select captain's ship
    setTimeout(() => selectShip(state.captainShipId), 500);
  } else {
    document.querySelectorAll('.captain-only').forEach(el => el.style.display = 'none');
  }
}

// ============================================================
// CLOCK
// ============================================================
function startClock() {
  const el = document.getElementById('topbar-clock');
  const update = () => {
    el.textContent = new Date().toUTCString().slice(17, 25) + ' UTC';
  };
  update();
  setInterval(update, 1000);
}

// ============================================================
// MAP INITIALIZATION
// ============================================================
function initMap() {
  map = L.map('map', {
    center: [26.5, 56.7],
    zoom: 9,
    zoomControl: true,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    className: 'dark-tiles',
  }).addTo(map);

  // Draw navigable area outline (simplified Strait of Hormuz)
  const navigableArea = [
    [26.0, 55.5], [27.2, 55.8], [27.5, 56.4], [27.4, 57.0],
    [26.9, 57.8], [26.2, 58.2], [25.5, 57.6], [25.2, 56.8],
    [25.6, 56.0], [26.0, 55.5],
  ];

  L.polygon(navigableArea, {
    color: 'rgba(0,196,244,0.3)',
    fillColor: 'rgba(0,196,244,0.04)',
    fillOpacity: 1,
    weight: 1,
    dashArray: '6,4',
  }).addTo(map);

  // Click on map for zone drawing
  map.on('click', onMapClick);
  map.on('dblclick', onMapDblClick);
}

// ============================================================
// FLEET INITIALIZATION
// ============================================================
function initFleet() {
  state.ships = FLEET_CONFIG.map(cfg => ({
    ...cfg,
    // Interpolation state
    renderLat: cfg.lat,
    renderLng: cfg.lng,
    prevLat: cfg.lat,
    prevLng: cfg.lng,
    targetLat: cfg.lat,
    targetLng: cfg.lng,
    weatherPenalty: false,
    inZone: false,
    distanceToPort: calcDistance(cfg.lat, cfg.lng,
      PORTS[cfg.dest]?.lat || cfg.lat,
      PORTS[cfg.dest]?.lng || cfg.lng),
    route: generateRoute(cfg.lat, cfg.lng, cfg.dest),
    routeIndex: 0,
  }));

  renderFleetList();
  renderShipsOnMap();
  updateStats();
  updateCommsDropdown();
}

function generateRoute(lat, lng, destName) {
  const dest = PORTS[destName];
  if (!dest) return [];
  // Simple straight-line route with intermediate waypoints
  const steps = 20;
  const route = [];
  for (let i = 0; i <= steps; i++) {
    route.push({
      lat: lat + (dest.lat - lat) * (i / steps),
      lng: lng + (dest.lng - lng) * (i / steps),
    });
  }
  return route;
}

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================
// SHIP MARKERS
// ============================================================
function getShipSVG(status, heading, selected) {
  const colors = {
    normal: '#00e676', rerouting: '#f4a500',
    distressed: '#ff3b3b', stopped: '#6a8fa8',
    stranded: '#ff3b3b', arrived: '#00e5c8',
  };
  const c = colors[status] || '#00e676';
  const glow = status === 'distressed' ? `filter: drop-shadow(0 0 6px ${c});` : '';
  const size = selected ? 20 : 16;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">
    <g transform="rotate(${heading}, 8, 8)" style="${glow}">
      <polygon points="8,1 12,12 8,10 4,12" fill="${c}" opacity="0.9"/>
      <circle cx="8" cy="8" r="2" fill="${c}" opacity="0.4"/>
    </g>
  </svg>`;
}

function renderShipsOnMap() {
  state.ships.forEach(ship => {
    const icon = L.divIcon({
      className: '',
      html: getShipSVG(ship.status, ship.heading, false),
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const marker = L.marker([ship.lat, ship.lng], { icon })
      .addTo(map)
      .bindTooltip(ship.name, {
        permanent: false,
        direction: 'top',
        offset: [0, -10],
        className: 'ship-marker-label',
      })
      .on('click', () => selectShip(ship.id));

    shipMarkers[ship.id] = marker;
  });
}

function updateMarker(ship) {
  const marker = shipMarkers[ship.id];
  if (!marker) return;
  marker.setLatLng([ship.renderLat, ship.renderLng]);
  const selected = state.selectedShipId === ship.id;
  marker.setIcon(L.divIcon({
    className: ship.status === 'distressed' ? 'distress-pulse' : '',
    html: getShipSVG(ship.status, ship.heading, selected),
    iconSize: selected ? [20, 20] : [16, 16],
    iconAnchor: selected ? [10, 10] : [8, 8],
  }));
}

// ============================================================
// SIMULATOR — 1Hz ticks
// ============================================================
function initSimulator() {
  setInterval(simulationTick, 1000);
  setInterval(interpolationFrame, 50); // 20fps interpolation
  setInterval(checkProximity, 2000);
  setInterval(snapshotHistory, 30000);
}

let lastTickTime = Date.now();

function simulationTick() {
  if (state.playbackMode) return;
  const now = Date.now();
  const dt = (now - lastTickTime) / 1000;
  lastTickTime = now;
  state.tick++;

  state.ships.forEach(ship => {
    if (ship.status === 'arrived' || ship.status === 'stopped') return;

    // Advance position
    if (ship.route && ship.route.length > 1 && ship.routeIndex < ship.route.length - 1) {
      const target = ship.route[ship.routeIndex + 1];
      const dist = calcDistance(ship.lat, ship.lng, target.lat, target.lng);
      const stepKm = (ship.speed * 1.852) * dt / 3600; // knots to km/s * dt

      if (dist <= stepKm) {
        ship.lat = target.lat;
        ship.lng = target.lng;
        ship.routeIndex++;
      } else {
        const ratio = stepKm / dist;
        ship.lat += (target.lat - ship.lat) * ratio;
        ship.lng += (target.lng - ship.lng) * ratio;
      }

      // Update heading
      if (ship.routeIndex < ship.route.length - 1) {
        const next = ship.route[ship.routeIndex + 1];
        ship.heading = calcBearing(ship.lat, ship.lng, next.lat, next.lng);
      }
    }

    // Check arrival
    const dest = PORTS[ship.dest];
    if (dest) {
      const distToDest = calcDistance(ship.lat, ship.lng, dest.lat, dest.lng);
      if (distToDest < 2) {
        ship.status = 'arrived';
        addAlert('info', ship.name, `${ship.name} has arrived at ${ship.dest}`);
        showToast('info', '⚓', `${ship.name} ARRIVED`, ship.dest);
      }
    }

    // Fuel consumption
    const fuelRate = ship.weatherPenalty ? 0.013 * 1.3 : 0.013;
    ship.fuel = Math.max(0, ship.fuel - fuelRate * dt);

    if (ship.fuel < 15 && ship.status === 'normal') {
      ship.status = 'distressed';
      addAlert('critical', ship.name, `${ship.name} has critically low fuel (${ship.fuel.toFixed(0)}%)`);
      showToast('critical', '⚠', `${ship.name} LOW FUEL`, `${ship.fuel.toFixed(0)}% remaining`);
    }

    // Weather simulation (random adverse patches)
    ship.weatherPenalty = (Math.sin(state.tick * 0.1 + ship.lat) > 0.6);

    // Target for interpolation
    ship.prevLat = ship.renderLat;
    ship.prevLng = ship.renderLng;
    ship.targetLat = ship.lat;
    ship.targetLng = ship.lng;
    ship.interpStart = Date.now();

    // Check geofences
    checkGeofence(ship);

    // Predictive alerts
    if (state.tick % 10 === 0) {
      checkPredictiveAlerts(ship);
    }
  });

  renderFleetList();
  updateStats();
  if (state.selectedShipId) updateShipDetail(getShip(state.selectedShipId));

  // Broadcast to WebSocket
  broadcastState();
}

function interpolationFrame() {
  if (state.playbackMode) return;
  const now = Date.now();

  state.ships.forEach(ship => {
    if (!ship.interpStart) return;
    const elapsed = (now - ship.interpStart) / 1000;
    const t = Math.min(elapsed, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease out cubic

    ship.renderLat = ship.prevLat + (ship.targetLat - ship.prevLat) * eased;
    ship.renderLng = ship.prevLng + (ship.targetLng - ship.prevLng) * eased;
    updateMarker(ship);
  });
}

function calcBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
             Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// ============================================================
// GEOFENCE CHECK
// ============================================================
function checkGeofence(ship) {
  state.zones.forEach(zone => {
    if (!zone.layer) return;
    const latlng = L.latLng(ship.lat, ship.lng);
    const inZone = isPointInPolygon(latlng, zone.points);

    if (inZone && !ship.inZone) {
      ship.inZone = true;
      ship.inZoneId = zone.id;

      if (ship.status !== 'stranded') ship.status = 'rerouting';
      addAlert('critical', ship.name,
        `⚠ GEOFENCE BREACH: ${ship.name} entered ${zone.name || 'Restricted Zone'}`);
      showToast('critical', '⚠', 'GEOFENCE BREACH', `${ship.name} → ${zone.name || 'Restricted Zone'}`);
      playAlertSound('critical');

      // Reroute away
      rerouteShipAroundZone(ship);
    } else if (!inZone && ship.inZoneId === zone.id) {
      ship.inZone = false;
      ship.inZoneId = null;
    }
  });
}

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
      (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function rerouteShipAroundZone(ship) {
  // Compute detour around zone by adding offset waypoints
  const dest = PORTS[ship.dest];
  if (!dest) return;

  const midLat = (ship.lat + dest.lat) / 2 + 0.3;
  const midLng = (ship.lng + dest.lng) / 2 + 0.2;

  ship.route = [
    { lat: ship.lat, lng: ship.lng },
    { lat: midLat, lng: midLng },
    { lat: dest.lat, lng: dest.lng },
  ];
  ship.routeIndex = 0;

  // Redraw route line
  drawRouteLine(ship);
}

function drawRouteLine(ship) {
  if (routeLines[ship.id]) map.removeLayer(routeLines[ship.id]);
  if (!ship.route || ship.route.length < 2) return;
  if (state.selectedShipId !== ship.id) return;

  const latlngs = ship.route.map(p => [p.lat, p.lng]);
  routeLines[ship.id] = L.polyline(latlngs, {
    color: ship.status === 'rerouting' ? '#f4a500' : '#00c4f4',
    weight: 2,
    opacity: 0.6,
    dashArray: ship.status === 'rerouting' ? '8,4' : null,
  }).addTo(map);
}

// ============================================================
// PROXIMITY CHECK
// ============================================================
function checkProximity() {
  const warnings = [];
  const ships = state.ships.filter(s => s.status !== 'arrived');

  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const dist = calcDistance(ships[i].lat, ships[i].lng, ships[j].lat, ships[j].lng);
      const key = `${ships[i].id}:${ships[j].id}`;

      if (dist < 2) {
        warnings.push({ a: ships[i], b: ships[j], dist });
        if (!proximityWarnings.has(key)) {
          proximityWarnings.add(key);
          addAlert('critical', ships[i].name,
            `⚠ PROXIMITY: ${ships[i].name} & ${ships[j].name} — ${dist.toFixed(2)}km apart`);
          showToast('critical', '🔴', 'COLLISION RISK', `${ships[i].name} ↔ ${ships[j].name}: ${dist.toFixed(2)}km`);
          playAlertSound('warning');
        }
      } else {
        proximityWarnings.delete(key);
      }
    }
  }

  const proxOverlay = document.getElementById('proximity-overlay');
  const proxText = document.getElementById('prox-text');
  if (warnings.length > 0) {
    proxOverlay.style.display = 'flex';
    proxText.textContent = `${warnings.length} PROXIMITY WARNING${warnings.length > 1 ? 'S' : ''}`;
  } else {
    proxOverlay.style.display = 'none';
  }
}

// ============================================================
// PREDICTIVE ALERTS (Bonus)
// ============================================================
function checkPredictiveAlerts(ship) {
  // Fuel prediction
  const dest = PORTS[ship.dest];
  if (dest) {
    const distLeft = calcDistance(ship.lat, ship.lng, dest.lat, dest.lng);
    const fuelPerKm = 0.4; // % per km estimate
    const fuelNeeded = distLeft * fuelPerKm;
    if (ship.fuel < fuelNeeded && ship.status !== 'distressed') {
      const shortfall = fuelNeeded - ship.fuel;
      addAlert('warning', ship.name,
        `⚡ PREDICTIVE: ${ship.name} may run out of fuel ${(shortfall / fuelPerKm).toFixed(0)}km short of ${ship.dest}`);
    }
  }

  // Zone prediction
  state.zones.forEach(zone => {
    if (!zone.points || zone.points.length < 3) return;
    // Project ship 3 minutes ahead (at ~13kts ≈ 1km/min)
    const projLat = ship.lat + Math.cos(ship.heading * Math.PI / 180) * 0.027;
    const projLng = ship.lng + Math.sin(ship.heading * Math.PI / 180) * 0.027;
    const willEnter = isPointInPolygon(L.latLng(projLat, projLng), zone.points);
    if (willEnter) {
      addAlert('warning', ship.name,
        `⏱ PREDICTIVE: ${ship.name} will enter ${zone.name || 'Restricted Zone'} in ~3 min`);
    }
  });
}

// ============================================================
// FLEET LIST RENDERING
// ============================================================
function renderFleetList() {
  const container = document.getElementById('fleet-list');
  const filtered = state.ships.filter(s => {
    if (state.fleetFilter !== 'all' && s.status !== state.fleetFilter) return false;
    if (state.fleetSearch) {
      const q = state.fleetSearch.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q)) return false;
    }
    if (state.role === 'captain' && s.id !== state.captainShipId) return false;
    return true;
  });

  container.innerHTML = '';
  filtered.forEach(ship => {
    const item = document.createElement('div');
    item.className = `fleet-item${state.selectedShipId === ship.id ? ' selected' : ''}`;
    if (ship.status === 'distressed') item.classList.add('distress-pulse');

    const statusColors = {
      normal: '#00e676', rerouting: '#f4a500', distressed: '#ff3b3b',
      stopped: '#6a8fa8', stranded: '#ff3b3b', arrived: '#00e5c8',
    };

    const fuelColor = ship.fuel > 50 ? '#00e676' : ship.fuel > 25 ? '#f4a500' : '#ff3b3b';

    item.innerHTML = `
      <div class="fleet-item-indicator" style="background:${statusColors[ship.status] || '#6a8fa8'}"></div>
      <div class="fleet-item-info">
        <div class="fleet-item-name">${ship.name}</div>
        <div class="fleet-item-sub">${ship.id} · ${ship.dest} · ${ship.speed.toFixed(1)}kts</div>
      </div>
      <div class="fleet-item-meta">
        <div class="fleet-item-fuel" style="color:${fuelColor}">⛽ ${ship.fuel.toFixed(0)}%</div>
        <div class="fleet-item-status badge-${ship.status}">${ship.status.toUpperCase()}</div>
      </div>
    `;

    item.addEventListener('click', () => selectShip(ship.id));
    container.appendChild(item);
  });
}

function filterFleet(q) {
  state.fleetSearch = q;
  renderFleetList();
}

function setFleetFilter(filter, btn) {
  state.fleetFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFleetList();
}

// ============================================================
// SHIP SELECTION
// ============================================================
function selectShip(id) {
  state.selectedShipId = id;
  const ship = getShip(id);
  if (!ship) return;

  renderFleetList();
  updateShipDetail(ship);
  drawRouteLine(ship);

  // Fly to ship on map
  map.flyTo([ship.lat, ship.lng], 11, { duration: 1 });

  switchRightTab('detail');
}

function getShip(id) {
  return state.ships.find(s => s.id === id);
}

function updateShipDetail(ship) {
  if (!ship) return;
  document.getElementById('no-selection-msg').style.display = 'none';
  document.getElementById('ship-detail').style.display = 'flex';
  document.getElementById('ship-detail').style.flexDirection = 'column';

  document.getElementById('det-icon').textContent = '🚢';
  document.getElementById('det-name').textContent = ship.name;
  document.getElementById('det-id').textContent = ship.id;

  const badge = document.getElementById('det-status');
  badge.textContent = ship.status.toUpperCase();
  badge.className = `detail-status-badge badge-${ship.status}`;

  document.getElementById('det-pos').textContent = `${ship.lat.toFixed(4)}°N ${ship.lng.toFixed(4)}°E`;
  document.getElementById('det-speed').textContent = `${ship.speed.toFixed(1)} kts${ship.weatherPenalty ? ' ⛈' : ''}`;
  document.getElementById('det-heading').textContent = `${ship.heading.toFixed(0)}°`;
  document.getElementById('det-dest').textContent = ship.dest;
  document.getElementById('det-cargo').textContent = ship.cargo;

  const fuel = ship.fuel;
  const fuelColor = fuel > 50 ? '#00e676' : fuel > 25 ? '#f4a500' : '#ff3b3b';
  document.getElementById('det-fuel-pct').textContent = `${fuel.toFixed(1)}%`;
  document.getElementById('det-fuel-bar').style.width = fuel + '%';
  document.getElementById('det-fuel-bar').style.background = fuelColor;

  const dist = calcDistance(ship.lat, ship.lng,
    PORTS[ship.dest]?.lat || ship.lat, PORTS[ship.dest]?.lng || ship.lng);
  document.getElementById('det-route').textContent =
    `${dist.toFixed(1)} km to ${ship.dest}\nETA: ~${(dist / (ship.speed * 1.852)).toFixed(1)} hrs` +
    (ship.weatherPenalty ? '\n⚡ +30% FUEL PENALTY (adverse weather)' : '');

  // Captain pending directives
  if (state.role === 'captain') {
    const pending = pendingDirectives[ship.id] || [];
    const container = document.getElementById('pending-directives');
    if (pending.length === 0) {
      container.innerHTML = '<div class="no-directives">No pending directives</div>';
    } else {
      container.innerHTML = pending.map((d, idx) => `
        <div class="directive-item">
          <div class="directive-item-from">📡 FROM FLEET COMMAND — ${d.time}</div>
          <div class="directive-item-text">${d.text}</div>
          <div class="directive-response-btns">
            <button class="directive-accept-btn" onclick="respondDirective('${ship.id}', ${idx}, 'accept')">✔ ACCEPT</button>
            <button class="directive-escalate-btn" onclick="respondDirective('${ship.id}', ${idx}, 'escalate')">⚠ ESCALATE</button>
          </div>
        </div>
      `).join('');
    }
  }

  // Update routes panel
  updateRoutesPanel(ship);
}

// ============================================================
// ROUTES PANEL (Bonus: multiple route options)
// ============================================================
function updateRoutesPanel(ship) {
  const panel = document.getElementById('routes-panel');
  const dest = PORTS[ship.dest];
  if (!dest) { panel.innerHTML = '<div class="routes-empty">No route data</div>'; return; }

  const baseDist = calcDistance(ship.lat, ship.lng, dest.lat, dest.lng);

  const options = [
    {
      name: 'DIRECT ROUTE',
      tag: 'FASTEST',
      tagColor: '#00c4f4',
      dist: baseDist.toFixed(1),
      time: (baseDist / (ship.speed * 1.852)).toFixed(1),
      fuel: (baseDist * 0.35).toFixed(0),
      risk: 'MODERATE',
    },
    {
      name: 'SAFE CORRIDOR',
      tag: 'SAFEST',
      tagColor: '#00e676',
      dist: (baseDist * 1.25).toFixed(1),
      time: (baseDist * 1.25 / (ship.speed * 1.852)).toFixed(1),
      fuel: (baseDist * 1.25 * 0.35).toFixed(0),
      risk: 'LOW',
    },
    {
      name: 'FUEL EFFICIENT',
      tag: 'ECONOMICAL',
      tagColor: '#f4a500',
      dist: (baseDist * 1.1).toFixed(1),
      time: (baseDist * 1.1 / (ship.speed * 0.85 * 1.852)).toFixed(1),
      fuel: (baseDist * 1.1 * 0.28).toFixed(0),
      risk: 'MODERATE',
    },
  ];

  panel.innerHTML = options.map((opt, i) => `
    <div class="route-option${i === 0 ? ' selected' : ''}" onclick="selectRouteOption(this, '${ship.id}', ${i})">
      <div class="route-option-header">
        <div class="route-option-name">${opt.name}</div>
        <div class="route-option-tag" style="background:${opt.tagColor}22;color:${opt.tagColor};border:1px solid ${opt.tagColor}44">${opt.tag}</div>
      </div>
      <div class="route-stats">
        <div class="route-stat"><div class="route-stat-label">DISTANCE</div><div class="route-stat-val">${opt.dist} km</div></div>
        <div class="route-stat"><div class="route-stat-label">ETA</div><div class="route-stat-val">${opt.time} hrs</div></div>
        <div class="route-stat"><div class="route-stat-label">FUEL USE</div><div class="route-stat-val">${opt.fuel}%</div></div>
        <div class="route-stat"><div class="route-stat-label">RISK</div><div class="route-stat-val" style="color:${opt.risk==='LOW'?'#00e676':opt.risk==='HIGH'?'#ff3b3b':'#f4a500'}">${opt.risk}</div></div>
      </div>
      ${state.role === 'command' ? `<button class="route-apply-btn" onclick="applyRoute('${ship.id}', ${i}); event.stopPropagation()">APPLY ROUTE ▶</button>` : ''}
    </div>
  `).join('');
}

function selectRouteOption(el, shipId, idx) {
  el.closest('.routes-panel').querySelectorAll('.route-option').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');
}

function applyRoute(shipId, optIdx) {
  const ship = getShip(shipId);
  if (!ship) return;
  const labels = ['Direct', 'Safe Corridor', 'Fuel Efficient'];
  addCommsMessage('FLEET COMMAND', ship.name, `Route updated: ${labels[optIdx]} route applied`, 'outgoing');
  showToast('info', '🗺', 'ROUTE APPLIED', `${ship.name}: ${labels[optIdx]} route`);
  drawRouteLine(ship);
}

// ============================================================
// COMMAND: ISSUE DIRECTIVE
// ============================================================
function issueDirective() {
  const shipId = state.selectedShipId;
  if (!shipId) return;
  const ship = getShip(shipId);
  const type = document.getElementById('directive-type').value;
  const detail = document.getElementById('directive-input')?.value ||
                 document.getElementById('directive-detail').value;

  if (!type) { showToast('warning', '⚠', 'SELECT ACTION', 'Choose a directive type'); return; }

  const directives = {
    reroute_port: `REROUTE to ${detail || 'alternate port'}`,
    waypoint: `DIVERT to waypoint: ${detail}`,
    hold: 'HOLD POSITION — maintain current coordinates',
    resume: 'RESUME original course to ' + ship.dest,
    emergency: 'EMERGENCY STOP — all engines halt immediately',
  };

  const text = directives[type] || type;
  const time = new Date().toUTCString().slice(17, 25);

  // Add to pending directives for captain
  if (!pendingDirectives[shipId]) pendingDirectives[shipId] = [];
  pendingDirectives[shipId].push({ text, time, type });

  // Apply immediate effect
  if (type === 'hold' || type === 'emergency') ship.status = 'stopped';
  else if (type === 'reroute_port' && PORTS[detail]) {
    ship.dest = detail;
    ship.route = generateRoute(ship.lat, ship.lng, detail);
    ship.routeIndex = 0;
    ship.status = 'rerouting';
    drawRouteLine(ship);
  }

  addCommsMessage('FLEET COMMAND', ship.name, `DIRECTIVE: ${text}`, 'outgoing');
  showToast('success', '📡', 'DIRECTIVE SENT', `To: ${ship.name}`);

  document.getElementById('directive-type').value = '';
  document.getElementById('directive-detail').value = '';
}

function respondDirective(shipId, idx, response) {
  const ship = getShip(shipId);
  if (!ship) return;

  if (response === 'accept') {
    pendingDirectives[shipId].splice(idx, 1);
    addCommsMessage(ship.name, 'FLEET COMMAND', 'DIRECTIVE ACCEPTED — Executing new orders', 'incoming');
    showToast('success', '✔', 'DIRECTIVE ACCEPTED', ship.name);
    ship.status = 'rerouting';
    updateShipDetail(ship);
  } else {
    // Open distress with pre-filled context
    document.getElementById('distress-msg').value = `ESCALATING directive. Situation prevents compliance: `;
    showToast('warning', '⚠', 'ESCALATION', 'File distress report below');
  }
}

// ============================================================
// DISTRESS SIGNAL + AI ANALYSIS
// ============================================================
function sendDistress() {
  const msg = document.getElementById('distress-msg').value.trim();
  if (!msg) { showToast('warning', '⚠', 'EMPTY MESSAGE', 'Enter distress details'); return; }

  const ship = state.captainShipId ? getShip(state.captainShipId) : getShip(state.selectedShipId);
  if (!ship) return;

  ship.status = 'distressed';
  addCommsMessage(ship.name, 'ALL STATIONS', msg, 'distress');
  addAlert('critical', ship.name, `🆘 DISTRESS: ${ship.name} — "${msg.slice(0, 80)}..."`);
  playAlertSound('critical');

  document.getElementById('distress-msg').value = '';
  updateShipDetail(ship);

  // Show AI modal
  document.getElementById('ai-modal').style.display = 'flex';
  document.getElementById('ai-modal-body').innerHTML = `
    <div class="ai-analyzing">
      <div class="ai-spinner"></div>
      <div>ANALYZING DISTRESS MESSAGE...</div>
    </div>
  `;

  // Simulate AI analysis (in production, call real Anthropic API)
  analyzeDistressMessage(ship, msg);
}

async function analyzeDistressMessage(ship, msg) {
  // Simulate AI processing delay
  await new Promise(r => setTimeout(r, 1800));

  // Local analysis (simplified NLP extraction)
  const severity = detectSeverity(msg);
  const extracted = extractDistressInfo(msg, ship);

  const severityColors = {
    CRITICAL: { bg: 'rgba(255,59,59,0.15)', border: 'rgba(255,59,59,0.4)', text: '#ff3b3b' },
    HIGH:     { bg: 'rgba(255,107,0,0.15)', border: 'rgba(255,107,0,0.4)', text: '#ff6b00' },
    MODERATE: { bg: 'rgba(244,165,0,0.15)', border: 'rgba(244,165,0,0.4)', text: '#f4a500' },
    LOW:      { bg: 'rgba(0,196,244,0.15)', border: 'rgba(0,196,244,0.4)', text: '#00c4f4' },
  };
  const sc = severityColors[severity] || severityColors.MODERATE;

  document.getElementById('ai-modal-body').innerHTML = `
    <div class="ai-result">
      <div class="ai-severity" style="background:${sc.bg};border-color:${sc.border};color:${sc.text}">
        <span>⚠</span>
        <div>
          <div class="ai-severity-label">SEVERITY: ${severity}</div>
          <div class="ai-severity-desc">${extracted.summary}</div>
        </div>
      </div>

      <div class="ai-field">
        <div class="ai-field-label">INCIDENT TYPE</div>
        <div class="ai-field-val">${extracted.type}</div>
      </div>
      <div class="ai-field">
        <div class="ai-field-label">QUANTIFIABLE IMPACT</div>
        <div class="ai-field-val">${extracted.impact}</div>
      </div>
      <div class="ai-field">
        <div class="ai-field-label">VESSEL</div>
        <div class="ai-field-val">${ship.name} (${ship.id}) — ${ship.dest}</div>
      </div>
      <div class="ai-field">
        <div class="ai-field-label">RECOMMENDED ACTION</div>
        <div class="ai-field-val">${extracted.action}</div>
      </div>

      <div class="ai-actions">
        <button class="ai-action-btn" style="border-color:#00e676;color:#00e676"
          onclick="dispatchAid('${ship.id}')">DISPATCH AID VESSEL</button>
        <button class="ai-action-btn" style="border-color:#f4a500;color:#f4a500"
          onclick="closeAiModal()">ACKNOWLEDGE</button>
      </div>
    </div>
  `;

  state.distressCount++;
  document.getElementById('stat-distress').textContent = state.distressCount;
}

function detectSeverity(msg) {
  const lower = msg.toLowerCase();
  if (lower.includes('sinking') || lower.includes('fire') || lower.includes('mayday') || lower.includes('abandon')) return 'CRITICAL';
  if (lower.includes('collision') || lower.includes('injured') || lower.includes('casualty') || lower.includes('taking on water')) return 'HIGH';
  if (lower.includes('engine') || lower.includes('fuel') || lower.includes('mechanical') || lower.includes('storm')) return 'MODERATE';
  return 'LOW';
}

function extractDistressInfo(msg, ship) {
  const lower = msg.toLowerCase();

  let type = 'General Distress';
  if (lower.includes('fire')) type = 'Fire / Explosion';
  else if (lower.includes('sinking') || lower.includes('water')) type = 'Hull Breach / Flooding';
  else if (lower.includes('collision')) type = 'Collision Damage';
  else if (lower.includes('engine') || lower.includes('mechanical')) type = 'Mechanical Failure';
  else if (lower.includes('fuel')) type = 'Critical Fuel Shortage';
  else if (lower.includes('storm') || lower.includes('weather')) type = 'Severe Weather';
  else if (lower.includes('medical') || lower.includes('injured')) type = 'Medical Emergency';
  else if (lower.includes('piracy') || lower.includes('attack')) type = 'Security Threat';

  // Extract numbers for impact
  const numbers = msg.match(/\d+/g);
  let impact = 'No quantifiable data extracted';
  if (numbers) {
    const num = numbers[0];
    if (lower.includes('crew') || lower.includes('person') || lower.includes('people')) {
      impact = `${num} crew members affected`;
    } else if (lower.includes('ton') || lower.includes('cargo')) {
      impact = `${num} MT cargo at risk`;
    } else if (lower.includes('km') || lower.includes('mile')) {
      impact = `${num} km from nearest port`;
    } else {
      impact = `Reference quantity: ${num}`;
    }
  }

  const actions = {
    'Fire / Explosion': 'Dispatch firefighting tug, alert coast guard, prepare evacuation',
    'Hull Breach / Flooding': 'Dispatch salvage vessel, alert search & rescue, prepare abandon ship',
    'Collision Damage': 'Dispatch assistance, alert maritime authority, assess structural integrity',
    'Mechanical Failure': 'Dispatch tug, arrange port berth, notify engineers',
    'Critical Fuel Shortage': 'Dispatch fuel tender, coordinate emergency refueling',
    'Severe Weather': 'Issue navigation warning, recommend alternative course',
    'Medical Emergency': 'Dispatch medevac helicopter, contact coast guard',
    'Security Threat': 'Alert naval authority, dispatch patrol vessel, do not engage pirates',
  };

  return {
    type,
    impact,
    action: actions[type] || 'Assess situation and dispatch nearest available vessel',
    summary: `${type} reported by ${ship.name} at ${ship.lat.toFixed(3)}°N ${ship.lng.toFixed(3)}°E`,
  };
}

function closeAiModal() {
  document.getElementById('ai-modal').style.display = 'none';
}

function dispatchAid(targetShipId) {
  const target = getShip(targetShipId);
  // Find nearest non-distressed ship
  let nearest = null, minDist = Infinity;
  state.ships.forEach(s => {
    if (s.id === targetShipId || s.status === 'distressed' || s.status === 'arrived') return;
    const d = calcDistance(s.lat, s.lng, target.lat, target.lng);
    if (d < minDist) { minDist = d; nearest = s; }
  });

  if (nearest) {
    nearest.dest = target.dest; // redirect to target area
    nearest.route = generateRoute(nearest.lat, nearest.lng, target.dest);
    nearest.routeIndex = 0;
    nearest.status = 'rerouting';
    addCommsMessage('FLEET COMMAND', nearest.name, `DIRECTIVE: ASSIST ${target.name} — Divert to their position`, 'outgoing');
    showToast('success', '⚓', 'AID DISPATCHED', `${nearest.name} → ${target.name}`);
  }
  closeAiModal();
}

// ============================================================
// ZONE DRAWING
// ============================================================
let drawingPoints = [];
let drawingPolyline = null;
let drawingMarkers = [];

function toggleZoneDraw() {
  if (state.role !== 'command') return;
  state.drawingZone = !state.drawingZone;

  const btn = document.getElementById('zone-draw-btn');
  const banner = document.getElementById('zone-draw-banner');

  if (state.drawingZone) {
    btn.classList.add('draw-active');
    banner.style.display = 'flex';
    map.getContainer().style.cursor = 'crosshair';
    drawingPoints = [];
  } else {
    cancelZoneDraw();
  }
}

function cancelZoneDraw() {
  state.drawingZone = false;
  drawingPoints = [];
  if (drawingPolyline) { map.removeLayer(drawingPolyline); drawingPolyline = null; }
  drawingMarkers.forEach(m => map.removeLayer(m));
  drawingMarkers = [];
  document.getElementById('zone-draw-btn').classList.remove('draw-active');
  document.getElementById('zone-draw-banner').style.display = 'none';
  map.getContainer().style.cursor = '';
}

function onMapClick(e) {
  if (!state.drawingZone) return;
  const { lat, lng } = e.latlng;
  drawingPoints.push({ lat, lng });

  // Add vertex marker
  const m = L.circleMarker([lat, lng], {
    radius: 4, color: '#f4a500', fillColor: '#f4a500', fillOpacity: 1, weight: 2,
  }).addTo(map);
  drawingMarkers.push(m);

  // Update preview polyline
  if (drawingPolyline) map.removeLayer(drawingPolyline);
  if (drawingPoints.length > 1) {
    drawingPolyline = L.polyline(drawingPoints.map(p => [p.lat, p.lng]), {
      color: '#f4a500', weight: 2, dashArray: '6,4', opacity: 0.7,
    }).addTo(map);
  }
}

function onMapDblClick(e) {
  if (!state.drawingZone || drawingPoints.length < 3) return;
  L.DomEvent.preventDefault(e);
  L.DomEvent.stopPropagation(e);

  state.pendingZone = { points: [...drawingPoints] };
  cancelZoneDraw();

  document.getElementById('zone-name-input').value = `ZONE ALPHA-${state.zones.length + 1}`;
  document.getElementById('zone-risk').value = 'restricted';
  document.getElementById('zone-reason').value = '';
  document.getElementById('zone-modal').style.display = 'flex';
}

function closeZoneModal() {
  document.getElementById('zone-modal').style.display = 'none';
  state.pendingZone = null;
}

function confirmZone() {
  if (!state.pendingZone) return;

  const name = document.getElementById('zone-name-input').value || 'Restricted Zone';
  const risk = document.getElementById('zone-risk').value;
  const reason = document.getElementById('zone-reason').value;

  const riskColors = {
    advisory: '#f4a500',
    restricted: '#ff6b00',
    exclusion: '#ff3b3b',
  };

  const color = riskColors[risk] || '#f4a500';
  const pts = state.pendingZone.points;

  const layer = L.polygon(pts.map(p => [p.lat, p.lng]), {
    color, fillColor: color, fillOpacity: 0.12, weight: 2, dashArray: risk === 'exclusion' ? null : '8,4',
  }).addTo(map);

  layer.bindTooltip(`${name}<br><small>${risk.toUpperCase()}</small>`, {
    permanent: true, direction: 'center', className: 'ship-marker-label',
  });

  const zone = {
    id: 'zone-' + Date.now(),
    name, risk, reason, points: pts, layer,
    color,
  };

  state.zones.push(zone);
  closeZoneModal();

  addAlert('warning', 'COMMAND', `Zone established: ${name} (${risk.toUpperCase()}) — ${reason}`);
  showToast('warning', '⬡', 'ZONE ESTABLISHED', `${name} — ${risk.toUpperCase()}`);

  // Check all ships against new zone
  state.ships.forEach(ship => checkGeofence(ship));
}

function clearAllZones() {
  if (state.role !== 'command') return;
  state.zones.forEach(z => { if (z.layer) map.removeLayer(z.layer); });
  state.zones = [];
  showToast('info', '✕', 'ZONES CLEARED', 'All restricted zones removed');
}

// ============================================================
// WEATHER
// ============================================================
async function initWeather() {
  const panel = document.getElementById('weather-panel');
  try {
    // Open-Meteo API — free, no key required
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=26.5&longitude=56.7&current=wind_speed_10m,wind_direction_10m,wave_height,weather_code,temperature_2m&wind_speed_unit=kn'
    );
    const data = await res.json();
    const c = data.current;

    state.weatherData = {
      windSpeed: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      waveHeight: c.wave_height || (Math.random() * 2 + 0.5).toFixed(1),
      temp: c.temperature_2m,
      code: c.weather_code,
    };

    const adverse = state.weatherData.windSpeed > 25 || state.weatherData.waveHeight > 2.5;
    const conditions = getWeatherCondition(c.weather_code);

    panel.innerHTML = `
      <div class="weather-card">
        <div class="weather-card-title">STRAIT OF HORMUZ — LIVE CONDITIONS</div>
        <div class="weather-data">
          <div class="weather-item">
            <div class="weather-item-label">WIND SPEED</div>
            <div class="weather-item-val">${c.wind_speed_10m.toFixed(0)} kts</div>
          </div>
          <div class="weather-item">
            <div class="weather-item-label">WIND DIR</div>
            <div class="weather-item-val">${c.wind_direction_10m.toFixed(0)}°</div>
          </div>
          <div class="weather-item">
            <div class="weather-item-label">WAVE HEIGHT</div>
            <div class="weather-item-val">${state.weatherData.waveHeight}m</div>
          </div>
          <div class="weather-item">
            <div class="weather-item-label">TEMP</div>
            <div class="weather-item-val">${c.temperature_2m.toFixed(0)}°C</div>
          </div>
        </div>
      </div>

      <div class="weather-card">
        <div class="weather-card-title">CONDITIONS</div>
        <div class="weather-data">
          <div class="weather-item" style="grid-column:span 2">
            <div class="weather-item-label">STATUS</div>
            <div class="weather-item-val" style="font-size:18px">${conditions}</div>
          </div>
        </div>
      </div>

      ${adverse ? '<div class="weather-adverse">⚡ ADVERSE CONDITIONS — +30% FUEL PENALTY ACTIVE</div>' : ''}

      <div class="weather-card">
        <div class="weather-card-title">REGIONAL FORECAST</div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary);line-height:1.8">
          <div>06:00Z — ${conditions} · ${c.wind_speed_10m.toFixed(0)}kts</div>
          <div>12:00Z — Partly cloudy · ${(c.wind_speed_10m * 0.9).toFixed(0)}kts</div>
          <div>18:00Z — Clear · ${(c.wind_speed_10m * 0.7).toFixed(0)}kts</div>
          <div>00:00Z — Clear · ${(c.wind_speed_10m * 0.6).toFixed(0)}kts</div>
        </div>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `
      <div class="weather-card">
        <div class="weather-card-title">SIMULATED CONDITIONS</div>
        <div class="weather-data">
          <div class="weather-item"><div class="weather-item-label">WIND SPEED</div><div class="weather-item-val">18 kts</div></div>
          <div class="weather-item"><div class="weather-item-label">WIND DIR</div><div class="weather-item-val">275°</div></div>
          <div class="weather-item"><div class="weather-item-label">WAVE HEIGHT</div><div class="weather-item-val">1.8m</div></div>
          <div class="weather-item"><div class="weather-item-label">VISIBILITY</div><div class="weather-item-val">Good</div></div>
        </div>
      </div>
      <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);padding:8px">
        ⚠ Live weather unavailable — using simulated data
      </div>
    `;
  }
}

function getWeatherCondition(code) {
  if (code === 0) return '☀ Clear Sky';
  if (code <= 3) return '⛅ Partly Cloudy';
  if (code <= 48) return '🌫 Foggy';
  if (code <= 67) return '🌧 Rain';
  if (code <= 77) return '❄ Snow';
  if (code <= 82) return '🌦 Rain Showers';
  if (code <= 99) return '⛈ Thunderstorm';
  return '🌤 Mixed';
}

function toggleWeatherOverlay() {
  state.weatherOverlayOn = !state.weatherOverlayOn;
  // Simulated weather overlay as colored polygon
  if (state.weatherOverlayOn) {
    weatherLayer = L.rectangle([[26.2, 56.0], [26.8, 57.2]], {
      color: '#f4a500', fillColor: '#f4a500', fillOpacity: 0.08,
      weight: 1, dashArray: '4,4',
    }).addTo(map).bindTooltip('⛈ ADVERSE WEATHER ZONE', { className: 'ship-marker-label' });
    showToast('info', '☁', 'WEATHER OVERLAY', 'Showing adverse weather zones');
  } else {
    if (weatherLayer) { map.removeLayer(weatherLayer); weatherLayer = null; }
  }
}

function toggleProximityRings() {
  state.proximityRingsOn = !state.proximityRingsOn;
  showToast('info', '◎', 'PROXIMITY RINGS', state.proximityRingsOn ? 'Showing 2km rings' : 'Hidden');
}

// ============================================================
// ALERTS SYSTEM
// ============================================================
function addAlert(type, source, message) {
  const alert = {
    id: 'alert-' + Date.now() + Math.random(),
    type, source, message,
    time: new Date().toUTCString().slice(17, 25),
    acked: false,
  };
  state.alerts.unshift(alert);
  if (state.alerts.length > 50) state.alerts.pop();
  state.alertCount++;

  renderAlerts();
  updateStats();
}

function renderAlerts() {
  const container = document.getElementById('alerts-list');
  const badge = document.getElementById('alert-count-badge');
  const active = state.alerts.filter(a => !a.acked);
  badge.textContent = `${active.length} ACTIVE`;

  if (active.length === 0) {
    container.innerHTML = '<div class="no-alerts">NO ACTIVE ALERTS</div>';
    return;
  }

  container.innerHTML = active.map(a => `
    <div class="alert-item ${a.type}" id="${a.id}">
      <div class="alert-item-header">
        <div class="alert-type status-${a.type === 'critical' ? 'distressed' : a.type === 'warning' ? 'rerouting' : 'arrived'}">
          ${a.type === 'critical' ? '⚠' : a.type === 'warning' ? '△' : 'ℹ'} ${a.source}
        </div>
        <div class="alert-time">${a.time}</div>
      </div>
      <div class="alert-msg">${a.message}</div>
      <button class="alert-ack-btn" onclick="acknowledgeAlert('${a.id}')">ACK</button>
    </div>
  `).join('');
}

function acknowledgeAlert(id) {
  const alert = state.alerts.find(a => a.id === id);
  if (alert) alert.acked = true;
  renderAlerts();
  updateStats();
}

function acknowledgeAll() {
  state.alerts.forEach(a => a.acked = true);
  renderAlerts();
  updateStats();
}

// ============================================================
// STATS UPDATE
// ============================================================
function updateStats() {
  const activeAlerts = state.alerts.filter(a => !a.acked).length;
  document.getElementById('stat-alerts').textContent = activeAlerts;
  document.getElementById('stat-alerts').className = `stat-val${activeAlerts > 0 ? ' alert' : ''}`;
  document.getElementById('stat-active').textContent = state.ships.filter(s => s.status !== 'arrived').length;
  document.getElementById('stat-distress').textContent = state.ships.filter(s => s.status === 'distressed').length;
}

// ============================================================
// COMMS
// ============================================================
function addCommsMessage(from, to, text, type = 'incoming') {
  const msg = { from, to, text, type, time: new Date().toUTCString().slice(17, 25) };
  state.commsLog.unshift(msg);

  const log = document.getElementById('comms-log');
  const empty = log.querySelector('.comms-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = `comms-msg ${type}`;
  el.innerHTML = `
    <div class="comms-msg-header">
      <div class="comms-msg-from">${from} → ${to}</div>
      <div class="comms-msg-time">${msg.time}</div>
    </div>
    <div class="comms-msg-text">${text}</div>
  `;
  log.insertBefore(el, log.firstChild);
}

function sendComms() {
  const msg = document.getElementById('comms-msg').value.trim();
  const to = document.getElementById('comms-to').value;
  if (!msg) return;

  const from = state.role === 'command' ? 'FLEET COMMAND' : (getShip(state.captainShipId)?.name || 'CAPTAIN');
  addCommsMessage(from, to === 'all' ? 'ALL VESSELS' : to, msg, 'outgoing');
  document.getElementById('comms-msg').value = '';
}

function updateCommsDropdown() {
  const sel = document.getElementById('comms-to');
  sel.innerHTML = '<option value="all">ALL VESSELS</option>';
  state.ships.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
}

// ============================================================
// WEBSOCKET (connects to backend — gracefully degrades)
// ============================================================
function connectWebSocket() {
  try {
    ws = new WebSocket(`ws://${window.location.hostname}:8765`);
    ws.onopen = () => showToast('success', '⚡', 'CONNECTED', 'Live sync established');
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'state_update') syncShipState(data.ships);
        if (data.type === 'directive') receiveDirective(data);
        if (data.type === 'alert') addAlert(data.severity, data.source, data.message);
        if (data.type === 'comms') addCommsMessage(data.from, data.to, data.text);
      } catch {}
    };
    ws.onclose = () => showToast('warning', '⚠', 'DISCONNECTED', 'Reconnecting...');
    ws.onerror = () => {}; // Gracefully ignore if no backend
  } catch {}
}

function broadcastState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'state', ships: state.ships.map(s => ({
    id: s.id, lat: s.lat, lng: s.lng, heading: s.heading,
    speed: s.speed, status: s.status, fuel: s.fuel,
  })) }));
}

function syncShipState(serverShips) {
  serverShips?.forEach(ss => {
    const local = getShip(ss.id);
    if (local) {
      local.targetLat = ss.lat;
      local.targetLng = ss.lng;
      local.heading = ss.heading;
      local.status = ss.status;
      local.fuel = ss.fuel;
    }
  });
}

function receiveDirective(data) {
  const ship = getShip(data.shipId);
  if (!ship) return;
  if (!pendingDirectives[data.shipId]) pendingDirectives[data.shipId] = [];
  pendingDirectives[data.shipId].push({ text: data.text, time: data.time, type: data.type });
  showToast('warning', '📡', 'DIRECTIVE RECEIVED', data.text.slice(0, 50));
  if (state.selectedShipId === data.shipId) updateShipDetail(ship);
}

// ============================================================
// PLAYBACK
// ============================================================
function snapshotHistory() {
  historyBuffer.push({
    time: Date.now(),
    ships: state.ships.map(s => ({ id: s.id, lat: s.lat, lng: s.lng, status: s.status, fuel: s.fuel })),
    alerts: state.alerts.filter(a => !a.acked).length,
  });
  if (historyBuffer.length > 120) historyBuffer.shift();
  renderPlaybackEvents();
}

function renderPlaybackEvents() {
  const eventsEl = document.getElementById('pb-events');
  if (!eventsEl) return;
  eventsEl.innerHTML = '';
  historyBuffer.forEach((snap, idx) => {
    if (snap.alerts > 0) {
      const dot = document.createElement('div');
      dot.className = 'pb-event-dot';
      dot.style.left = (idx / 120 * 100) + '%';
      dot.style.background = '#ff3b3b';
      dot.title = `${snap.alerts} alerts`;
      eventsEl.appendChild(dot);
    }
  });
}

function togglePlayback() {
  state.playbackMode = !state.playbackMode;
  document.getElementById('playback-bar').style.display = state.playbackMode ? 'flex' : 'none';
}

function pbScrub(val) {
  state.pbPosition = parseInt(val);
  const idx = Math.floor((val / 120) * historyBuffer.length);
  const snap = historyBuffer[idx];

  const fill = document.getElementById('pb-fill');
  const thumb = document.getElementById('pb-thumb');
  const timeEl = document.getElementById('pb-time');

  fill.style.width = (val / 120 * 100) + '%';
  thumb.style.left = (val / 120 * 100) + '%';

  if (snap) {
    const t = new Date(snap.time);
    timeEl.textContent = t.toUTCString().slice(17, 25) + ' UTC';
    // Show historical ship positions
    snap.ships.forEach(ss => {
      const m = shipMarkers[ss.id];
      if (m) m.setLatLng([ss.lat, ss.lng]);
    });
  } else {
    timeEl.textContent = 'LIVE';
  }
}

function pbControl(action) {
  const range = document.getElementById('pb-range');
  if (action === 'start') { range.value = 0; pbScrub(0); }
  if (action === 'end') { range.value = 120; pbScrub(120); state.playbackMode = false; }
  if (action === 'play') state.playbackMode = false;
  if (action === 'pause') state.playbackMode = true;
}

function setPbSpeed(val) { /* backend would handle this */ }

// ============================================================
// TOPBAR & TABS
// ============================================================
function initTopbar() {
  document.getElementById('topbar-role').textContent = state.role.toUpperCase();
}

function switchLeftTab(tab) {
  document.querySelectorAll('.left-panel .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.left-panel .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
}

function switchRightTab(tab) {
  document.querySelectorAll('.right-panel .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.right-panel .tab-content').forEach(c => c.classList.toggle('active', c.id === 'rtab-' + tab));
}

// ============================================================
// FIT FLEET
// ============================================================
function fitFleet() {
  const latlngs = state.ships.map(s => [s.lat, s.lng]);
  if (latlngs.length > 0) map.fitBounds(latlngs, { padding: [40, 40] });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(type, icon, title, msg) {
  const stack = document.getElementById('toast-stack');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>
  `;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================
// ALERT SOUND
// ============================================================
let audioCtx = null;

function playAlertSound(type) {
  if (state.muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'critical') {
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.2);
    } else {
      osc.frequency.setValueAtTime(660, audioCtx.currentTime);
      osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.15);
    }

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {}
}

function toggleAlertsMute() {
  state.muted = !state.muted;
  document.getElementById('mute-btn').textContent = state.muted ? '🔇' : '🔊';
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', boot);