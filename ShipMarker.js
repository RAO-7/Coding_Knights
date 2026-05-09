import { useState, useEffect } from 'react';
import { Marker, Popup } from 'react-leaflet';

const ShipMarker = ({ ship }) => {
  const [pos, setPos] = useState([ship.lat, ship.lng]);

  useEffect(() => {
    // Basic Linear Interpolation (LERP) simulation
    // In a production app, use 'react-leaflet-animated-marker'
    setPos([ship.lat, ship.lng]); 
  }, [ship.lat, ship.lng]);

  const icon = L.divIcon({
    className: 'custom-ship-icon',
    html: `<div style="transform: rotate(${ship.heading}deg)">🚢</div>`
  });

  return (
    <Marker position={pos} icon={icon}>
      <Popup>
        <div className="text-black">
          <h3 className="font-bold">{ship.id}</h3>
          <p>Status: {ship.status}</p> [cite: 58]
          <p>Fuel: ${ship.fuel.toFixed(1)}%</p>
        </div>
      </Popup>
    </Marker>
  );
};
