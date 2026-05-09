import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for Leaflet marker icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: shadow, iconSize: [25,41], iconAnchor: [12,41]});
L.Marker.prototype.options.icon = DefaultIcon;

const ShipMap = ({ ships, zones }) => {
    return (
        <MapContainer center={[26.1, 56.3]} zoom={9} style={{ height: "100%", width: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            {ships.map(ship => (
                <Marker key={ship.id} position={[ship.lat, ship.lng]}>
                    <Popup>
                        <b>{ship.name}</b><br/>
                        Status: {ship.status}
                    </Popup>
                </Marker>
            ))}

            {zones.map((zone, i) => (
                <Polygon key={i} positions={zone.coordinates} color="red" />
            ))}
        </MapContainer>
    );
};

export default ShipMap;
