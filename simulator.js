// simulator.js - Core Tick Logic
class FleetSimulator {
  constructor(ships) {
    this.ships = ships; // 15 ships [cite: 9]
    this.restrictedZones = []; 
  }

  tick() {
    this.ships.forEach(ship => {
      if (ship.status === 'stopped' || ship.fuel <= 0) return;

      // Physics: Advance position based on speed/heading [cite: 46]
      const delta = (ship.speed / 3600); // simplistic degree/sec conversion
      ship.lat += Math.sin(ship.heading) * delta;
      ship.lng += Math.cos(ship.heading) * delta;

      // Weather & Fuel [cite: 14, 47]
      const fuelRate = ship.inAdverseWeather ? 1.3 : 1.0;
      ship.fuel -= (ship.speed * 0.01) * fuelRate;

      if (ship.fuel <= 0) ship.status = 'out of fuel';
      
      // Proximity Check (Naive O(n^2) for 15 ships) [cite: 78, 79]
      this.checkProximity(ship);
    });
    return this.ships;
  }
  
  checkProximity(ship) {
      // Logic for 2km proximity warnings [cite: 13]
  }
}
