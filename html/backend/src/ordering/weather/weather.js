const axios = require('axios');

const CACHE_TTL_MS = (parseInt(process.env.WEATHER_CACHE_TTL) || 300) * 1000;
const ADVERSE_WIND_MS = 10;
const ADVERSE_WAVE_M = 2.5;

class WeatherService {
  constructor() {
    this._cache = new Map();
    this.shipWeather = new Map();
  }

  _cacheKey(lat, lng) {
    return `${Math.round(lat * 2) / 2},${Math.round(lng * 2) / 2}`;
  }

  async fetchWeather(lat, lng) {
    const key = this._cacheKey(lat, lng);
    const now = Date.now();
    const cached = this._cache.get(key);
    if (cached && now - cached.ts < CACHE_TTL_MS) return cached.data;

    try {
      const resp = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: lat, longitude: lng,
          current: 'wind_speed_10m,wind_direction_10m,precipitation,weather_code',
          hourly: 'wave_height', forecast_days: 1, timezone: 'UTC',
        },
        timeout: 5000,
      });
      const current = resp.data.current;
      const waveHeight = resp.data.hourly?.wave_height?.[0] ?? null;
      const data = {
        windSpeedMs: current.wind_speed_10m,
        windDirectionDeg: current.wind_direction_10m,
        precipitation: current.precipitation,
        weatherCode: current.weather_code,
        waveHeightM: waveHeight,
        isAdverse: this._isAdverse(current.wind_speed_10m, waveHeight, current.weather_code),
        description: this._describeWeather(current.weather_code, current.wind_speed_10m),
        fetchedAt: new Date().toISOString(),
      };
      this._cache.set(key, { data, ts: now });
      return data;
    } catch (err) {
      console.warn(`[Weather] fetch failed for (${lat.toFixed(2)}, ${lng.toFixed(2)}): ${err.message}`);
      return this._defaultWeather();
    }
  }

  _isAdverse(windMs, waveM, code) {
    return windMs > ADVERSE_WIND_MS || (waveM !== null && waveM > ADVERSE_WAVE_M) || code >= 65;
  }

  _describeWeather(code, windMs) {
    const descriptions = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
      95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail',
    };
    const base = descriptions[code] || `WMO code ${code}`;
    return base + (windMs > ADVERSE_WIND_MS ? ` | Wind ${windMs.toFixed(1)} m/s` : '');
  }

  _defaultWeather() {
    return {
      windSpeedMs: 3, windDirectionDeg: 0, precipitation: 0,
      weatherCode: 1, waveHeightM: 0.5, isAdverse: false,
      description: 'Clear sky (estimated)', fetchedAt: new Date().toISOString(),
    };
  }

  async updateAllShips(ships) {
    await Promise.allSettled(
      ships.map(async (ship) => {
        const w = await this.fetchWeather(ship.lat, ship.lng);
        this.shipWeather.set(ship.id, w);
      })
    );
  }

  getShipWeather(shipId) { return this.shipWeather.get(shipId) || this._defaultWeather(); }
  getAllWeather() {
    const result = {};
    for (const [id, w] of this.shipWeather) result[id] = w;
    return result;
  }
}

const weatherService = new WeatherService();
module.exports = { weatherService };