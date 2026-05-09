const io = require('socket.io')(server);
const simulator = new FleetSimulator(initialData);

setInterval(() => {
  const updatedState = simulator.tick();
  io.emit('fleetUpdate', updatedState); // Broadcast to all roles [cite: 62]
}, 1000); // 1Hz [cite: 10]

io.on('connection', (socket) => {
  socket.on('issueDirective', (data) => {
    // Command role only logic [cite: 66, 68]
    io.emit('captainDirective', data);
  });
});
