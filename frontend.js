import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import ShipMap from './ShipMap';
import './App.css';

const socket = io('http://localhost:4000');

function App() {
    const [fleet, setFleet] = useState([]);
    const [activeZones, setActiveZones] = useState([]);

    useEffect(() => {
        socket.on('fleetUpdate', (data) => {
            setFleet(data.ships);
            setActiveZones(data.zones);
        });
        return () => socket.off('fleetUpdate');
    }, []);

    return (
        <div className="command-center">
            <aside className="sidebar">
                <h2>Fleet Status</h2>
                <div className="ship-list">
                    {fleet.map(s => (
                        <div key={s.id} className={`ship-card ${s.status}`}>
                            <strong>{s.name}</strong>
                            <p>Fuel: {s.fuel.toFixed(1)}%</p>
                        </div>
                    ))}
                </div>
            </aside>
            <main className="map-container">
                <ShipMap ships={fleet} zones={activeZones} />
            </main>
        </div>
    );
}

export default App;
