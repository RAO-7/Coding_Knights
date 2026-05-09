import React, { useState, useEffect } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';

function App() {
  const [role, setRole] = useState('COMMAND'); // Toggle for testing
  const [fleet, setFleet] = useState([]); // Real-time ship data
  const [selectedShipId, setSelectedShipId] = useState(null);

  // Filter view if role is Captain
  const visibleFleet = role === 'CAPTAIN' 
    ? fleet.filter(s => s.id === "SHIP_001") // Mock ID for current user
    : fleet;

  return (
    <div className="flex h-screen bg-slate-900 text-white overflow-hidden">
      <Sidebar role={role} fleet={visibleFleet} onSelect={setSelectedShipId} />
      <div className="flex-1 relative">
        <MapView 
          role={role} 
          fleet={visibleFleet} 
          selectedId={selectedShipId} 
        />
      </div>
    </div>
  );
}

export default App;
