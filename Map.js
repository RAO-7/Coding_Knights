import { MapContainer, TileLayer, Marker, Polygon } from 'react-leaflet';

const FleetMap = ({ ships, role }) => {
  return (
    <MapContainer center={[26.5, 56.2]} zoom={8} className="h-screen w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      
      {ships.map(ship => (
        <Marker 
          key={ship.id} 
          position={[ship.lat, ship.lng]}
          [cite_start]eventHandlers={{ click: () => showShipDetails(ship) }} // [cite: 58]
        />
      ))}

      {/* Command-only Drawing [cite: 55, 66] */}
      {role === 'COMMAND' && <ZoneDrawer />}
    </MapContainer>
  );
};
