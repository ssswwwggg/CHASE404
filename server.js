const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 16;
const rooms = new Map();

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function createMap() {
  return [
    { x: 0, z: -50, w: 100, d: 2 },
    { x: 0, z: 50, w: 100, d: 2 },
    { x: -50, z: 0, w: 2, d: 100 },
    { x: 50, z: 0, w: 2, d: 100 },

    { x: -30, z: -25, w: 5, d: 5 },
    { x: -18, z: -12, w: 7, d: 4 },
    { x: -5, z: -30, w: 4, d: 7 },
    { x: 10, z: -22, w: 6, d: 6 },
    { x: 25, z: -30, w: 5, d: 5 },
    { x: 32, z: -10, w: 7, d: 4 },
    { x: -32, z: 5, w: 5, d: 7 },
    { x: -18, z: 20, w: 6, d: 5 },
    { x: 0, z: 10, w: 5, d: 5 },
    { x: 12, z: 25, w: 7, d: 4 },
    { x: 28, z: 18, w: 5, d: 6 },
    { x: 35, z: 35, w: 6, d: 6 },
    { x: -30, z: 35, w: 5, d: 5 },
    { x: -8, z: 38, w: 7, d: 4 }
  ];
}

function blocked(x, z, obstacles) {
  const r = 0.7;

  return obstacles.some(o => {
    const minX = o.x - o.w / 2 - r;
    const maxX = o.x + o.w / 2 + r;
    const minZ = o.z - o.d / 2 - r;
    const maxZ = o.z + o.d / 2 + r;

    return x > minX && x < maxX && z > minZ && z < maxZ;
  });
}

function clamp(v) {
  return Math.max(-47, Math.min(47, v));
}

function broadcast(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit("state", {
    players: room.players,
    chaser: room.chaser,
    obstacles: room.obstacles
  });
}

function findSpawn(room) {
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * 20 - 10;
    const z = Math.random() * 20 - 10;

    if (!blocked(x, z, room.obstacles)) {
      return { x, z };
    }
  }

  return { x: 0, z: 0 };
}

io.on("connection", socket => {
  socket.on("joinRoom", requestedRoom => {
    let roomCode = String(requestedRoom || "").trim().toUpperCase();

    if (!roomCode) {
      do {
        roomCode = makeRoomCode();
      } while (rooms.has(roomCode));
    }

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        players: {},
        chaser: null,
        obstacles: createMap()
      });
    }

    const room = rooms.get(roomCode);

    if (Object.keys(room.players).length >= MAX_PLAYERS) {
      socket.emit("errorMessage", "방이 가득 찼습니다.");
      return;
    }

    const spawn = findSpawn(room);

    room.players[socket.id] = {
      x: spawn.x,
      z: spawn.z,
      rot: 0,
      it: false
    };

    if (!room.chaser) {
      room.chaser = socket.id;
    }

    room.players[room.chaser].it = true;
    socket.data.room = roomCode;

    socket.emit("joined", {
      id: socket.id,
      room: roomCode,
      obstacles: room.obstacles
    });

    broadcast(roomCode);
  });

  socket.on("move", data => {
    const roomCode = socket.data.room;
    const room = rooms.get(roomCode);
    const me = room?.players?.[socket.id];

    if (!room || !me || !data) return;

    const x = Number(data.x);
    const z = Number(data.z);
    const rot = Number(data.rot);

    if (Number.isFinite(x) && !blocked(clamp(x), me.z, room.obstacles)) {
      me.x = clamp(x);
    }

    if (Number.isFinite(z) && !blocked(me.x, clamp(z), room.obstacles)) {
      me.z = clamp(z);
    }

    if (Number.isFinite(rot)) {
      me.rot = rot;
    }

    if (me.it) {
      for (const [id, target] of Object.entries(room.players)) {
        if (id === socket.id || target.it) continue;

        const distance = Math.hypot(
          me.x - target.x,
          me.z - target.z
        );

        if (distance < 1.7) {
          me.it = false;
          target.it = true;
          room.chaser = id;
          break;
        }
      }
    }

    broadcast(roomCode);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.room;
    const room = rooms.get(roomCode);

    if (!room) return;

    const wasChaser = room.chaser === socket.id;
    delete room.players[socket.id];

    if (wasChaser) {
      const ids = Object.keys(room.players);
      room.chaser = ids[0] || null;

      if (room.chaser) {
        room.players[room.chaser].it = true;
      }
    }

    if (Object.keys(room.players).length === 0) {
      rooms.delete(roomCode);
      return;
    }

    broadcast(roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`CHASE 404 server running on port ${PORT}`);
});
