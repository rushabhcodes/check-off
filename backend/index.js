import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Be cautious with this in a production environment
  },
});

const numberOfCheckboxes = 10;
const totalCheckboxes = 100; // For the 4v4 mode
const roomUserCounts = {}; // Track the number of users in each room
const roomCheckboxStates = {}; // Track the checkbox states for each room
const roomTimers = {}; // Track timers for each room
const roomTeams = {}; // Track teams in each room

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("createRoom", (roomId, gameMode) => {
    socket.join(roomId);
    roomUserCounts[roomId] = (roomUserCounts[roomId] || 0) + 1;
    roomCheckboxStates[roomId] = Array(gameMode === "4v4" ? totalCheckboxes : numberOfCheckboxes).fill(false);
    roomTimers[roomId] = { started: false, interval: null, startTime: null }; // Initialize timer for the room
    roomTeams[roomId] = { red: new Set(), blue: new Set() }; // Initialize teams for the room
    console.log(`Room ${roomId} created. Users in room: ${roomUserCounts[roomId]}`);
    socket.emit('checkboxStates', roomCheckboxStates[roomId]);
  });

  socket.on("joinRoom", (roomId, team) => {
    if (io.sockets.adapter.rooms.has(roomId)) {
      socket.join(roomId);
      roomUserCounts[roomId] = (roomUserCounts[roomId] || 0) + 1;

      // Initialize roomTeams[roomId] if not already initialized
      if (!roomTeams[roomId]) {
        roomTeams[roomId] = { red: new Set(), blue: new Set() };
      }

      // Remove user from any existing team
      for (const teamSet of Object.values(roomTeams[roomId])) {
        teamSet.delete(socket.id);
      }

      // Add user to the selected team
      if (team && roomTeams[roomId][team]) {
        roomTeams[roomId][team].add(socket.id);
      } else {
        console.error(`Invalid team specified: ${team}`);
      }

      console.log(`User ${socket.id} joined room ${roomId}. Users in room: ${roomUserCounts[roomId]}`);
      socket.emit('checkboxStates', roomCheckboxStates[roomId]);
    } else {
      console.log(`User ${socket.id} failed to join room ${roomId}. Room does not exist.`);
      socket.emit('error', 'Room does not exist.');
    }
  });

  socket.on("leaveRoom", (roomId) => {
    if (socket.rooms.has(roomId)) {
      socket.leave(roomId);
      roomUserCounts[roomId] = Math.max((roomUserCounts[roomId] || 0) - 1, 0);

      // Remove user from any team they belong to
      if (roomTeams[roomId]) {
        for (const teamSet of Object.values(roomTeams[roomId])) {
          teamSet.delete(socket.id);
        }
      }

      console.log(`User ${socket.id} left room ${roomId}. Users remaining: ${roomUserCounts[roomId]}`);
      
      // Remove the room if no users are left
      if (roomUserCounts[roomId] === 0) {
        delete roomUserCounts[roomId];
        delete roomCheckboxStates[roomId];
        stopRoomTimer(roomId); // Ensure timer for the room is stopped
        delete roomTeams[roomId];
        io.sockets.adapter.rooms.delete(roomId);
        console.log(`Room ${roomId} deleted as it is empty.`);
      }
    }
  });

  socket.on('checkboxChange', (roomId, index, state) => {
    if (socket.rooms.has(roomId) && index >= 0 && index < (roomCheckboxStates[roomId]?.length || 0)) {
      roomCheckboxStates[roomId][index] = state;
      io.to(roomId).emit('checkboxStates', roomCheckboxStates[roomId]);

      if (roomCheckboxStates[roomId].every(checked => checked)) {
        console.log(`All checkboxes checked in room ${roomId}. Stopping timer.`);
        stopRoomTimer(roomId);
      }
    } else {
      console.error("Invalid checkbox index or room:", index, roomId);
    }
  });

  socket.on('startTimer', (roomId) => {
    if (socket.rooms.has(roomId) && !roomTimers[roomId]?.started) {
      roomTimers[roomId].startTime = Date.now();
      roomTimers[roomId].started = true;
      io.to(roomId).emit('timerUpdate', { timer: 0 });
      roomTimers[roomId].interval = setInterval(() => {
        io.to(roomId).emit('timerUpdate', { timer: Date.now() - roomTimers[roomId].startTime });
      }, 1000);
      console.log(`Timer started in room ${roomId}.`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const stopRoomTimer = (roomId) => {
  if (roomTimers[roomId]?.interval) {
    clearInterval(roomTimers[roomId].interval);
    roomTimers[roomId].interval = null;
    roomTimers[roomId].started = false;
    const totalTime = Date.now() - (roomTimers[roomId].startTime || 0);
    io.to(roomId).emit('timerStopped', { totalTime });
    console.log(`Timer stopped for room ${roomId}. Total time: ${totalTime}`);
  }
};

// Gracefully handle server shutdown
const handleShutdown = () => {
  // Clear all room timers on shutdown
  Object.keys(roomTimers).forEach(stopRoomTimer);
  server.close(() => {
    console.log('Server shut down gracefully.');
  });
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

app.get("/", (req, res) => {
  res.send("<h1>Hello world</h1>");
});

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
  