import { AlertTriangle, Send, Navigation } from 'lucide-react';

const Sidebar = ({ role, fleet }) => {
  return (
    <div className="w-80 border-r border-slate-700 p-4 flex flex-col gap-4">
      <h2 className="text-xl font-bold border-b pb-2">{role} DASHBOARD</h2>
      
      {/* Alert Panel */}
      <div className="bg-red-900/30 border border-red-500 p-3 rounded">
        <div className="flex items-center gap-2 text-red-400 font-bold mb-2">
          <AlertTriangle size={18} /> LIVE ALERTS 
        </div>
        <ul className="text-xs space-y-1">
          <li>• SHIP_004: Proximity Warning (1.2km)</li> [cite: 79]
          <li>• SHIP_012: Geofence Breach</li> [cite: 12]
        </ul>
      </div>

      {/* Role Specific Actions */}
      {role === 'COMMAND' ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Issue Directive</p>
          <button className="w-full bg-blue-600 p-2 rounded text-sm flex items-center justify-center gap-2">
            <Navigation size={16} /> Divert Fleet [cite: 33]
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea 
            className="w-full bg-slate-800 p-2 rounded text-sm h-24"
            placeholder="Type distress message..."
          />
          <button className="w-full bg-orange-600 p-2 rounded text-sm flex items-center justify-center gap-2">
            <Send size={16} /> Send Distress [cite: 70]
          </button>
        </div>
      )}
    </div>
  );
};
