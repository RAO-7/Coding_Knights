import { MapContainer, TileLayer, Marker, Popup, Polygon, FeatureGroup } from 'react-leaflet';
import { EditControl } from "react-leaflet-draw";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

const MapView = ({ role, fleet, selectedId }) => {
  // Strait of Hormuz focus
  const center = [26.58, 56.32]; [cite: 49]

  const onCreated = (e) => {
    if (role !== 'COMMAND') return;
    const { layerType, layer } = e;
    if (layerType === 'polygon') {
      const coords = layer.getLatLngs();
      console.log("New Restricted Zone created:", coords);
      // Emit to server via Socket: socket.emit('newZone', coords); [cite: 55]
    }
  };

  return (
    <MapContainer center={center} zoom={8} className="h-full w-full bg-slate-800">
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      
      {fleet.map(ship => (
        <ShipMarker key={ship.id} ship={ship} isSelected={ship.id === selectedId} />
      ))}

      <FeatureGroup>
        {role === 'COMMAND' && (
          <EditControl
            position='topright'
            onCreated={onCreated}
            draw={{
              rectangle: false, circle: false, circlemarker: false, marker: false, polyline: false,
            }}
          />
        )}
      </FeatureGroup>
    </MapContainer>
  );
};
