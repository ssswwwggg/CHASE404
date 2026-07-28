```js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

const rooms = new Map();

const MAX_PLAYERS = 16;


// ======================================
// 방 코드 생성
// ======================================

function createRoomCode() {

  return Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase();

}


// ======================================
// 맵 생성
// ======================================

function createMap() {

  const obstacles = [];

  // 외벽

  obstacles.push({
    x: 0,
    z: -50,
    w: 100,
    d: 2
  });

  obstacles.push({
    x: 0,
    z: 50,
    w: 100,
    d: 2
  });

  obstacles.push({
    x: -50,
    z: 0,
    w: 2,
    d: 100
  });

  obstacles.push({
    x: 50,
    z: 0,
    w: 2,
    d: 100
  });


  // 조형물

  const fixedObjects = [

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


  for (const obj of fixedObjects) {

    obstacles.push(obj);

  }


  return obstacles;

}


// ======================================
// 충돌 검사
// ======================================

function isBlocked(
  x,
  z,
  obstacles
) {

  const radius = 0.7;


  for (const o of obstacles) {

    const minX =
      o.x -
      o.w / 2 -
      radius;

    const maxX =
      o.x +
      o.w / 2 +
      radius;

    const minZ =
      o.z -
      o.d / 2 -
      radius;

    const maxZ =
      o.z +
      o.d / 2 +
      radius;


    if (
      x > minX &&
      x < maxX &&
      z > minZ &&
      z < maxZ
    ) {

      return true;

    }

  }


  return false;

}


// ======================================
// 위치 제한
// ======================================

function clampPosition(value) {

  return Math.max(
    -47,
    Math.min(
      47,
      value
    )
  );

}


// ======================================
// STATE 전송
// ======================================

function broadcastState(roomCode) {

  const room =
    rooms.get(roomCode);


  if (!room) {

    console.log(
      '[CHASE404] STATE 실패: 방 없음',
      roomCode
    );

    return;

  }


  const playerCount =
    Object.keys(
      room.players
    ).length;


  console.log(
    '[CHASE404] STATE_SENT',
    'room:',
    roomCode,
    'players:',
    playerCount,
    'chaser:',
    room.chaser
  );


  io.to(roomCode).emit(
    'state',
    {
      players: room.players,

      chaser: room.chaser,

      obstacles: room.obstacles
    }
  );

}


// ======================================
// Socket.IO
// ======================================

io.on(
  'connection',
  socket => {


    console.log(
      '[CHASE404] CONNECT',
      socket.id
    );


    // ==================================
    // 방 참가
    // ==================================

    socket.on(
      'joinRoom',
      requestedRoom => {


        console.log(
          '[CHASE404] JOIN_REQUEST',
          socket.id,
          requestedRoom
        );


        const roomCode =
          requestedRoom ||
          createRoomCode();


        if (
          !rooms.has(roomCode)
        ) {

          rooms.set(
            roomCode,
            {
              players: {},
              chaser: null,
              obstacles: createMap()
            }
          );


          console.log(
            '[CHASE404] ROOM_CREATED',
            roomCode
          );

        }


        const room =
          rooms.get(roomCode);


        const playerCount =
          Object.keys(
            room.players
          ).length;


        if (
          playerCount >=
          MAX_PLAYERS
        ) {


          console.log(
            '[CHASE404] ROOM_FULL',
            roomCode
          );


          socket.emit(
            'errorMessage',
            '방이 가득 찼습니다.'
          );


          return;

        }


        // ==================================
        // 시작 위치
        // ==================================

        let startX = 0;

        let startZ = 0;


        for (
          let i = 0;
          i < 50;
          i++
        ) {


          const testX =
            Math.random() *
            20 -
            10;


          const testZ =
            Math.random() *
            20 -
            10;


          if (
            !isBlocked(
              testX,
              testZ,
              room.obstacles
            )
          ) {


            startX =
              testX;


            startZ =
              testZ;


            break;

          }

        }


        // ==================================
        // 플레이어 생성
        // ==================================

        room.players[
          socket.id
        ] = {

          x: startX,

          z: startZ,

          rot: 0,

          it: false

        };


        console.log(
          '[CHASE404] PLAYER_CREATED',
          socket.id,
          'room:',
          roomCode,
          'x:',
          startX,
          'z:',
          startZ
        );


        // ==================================
        // 첫 번째 플레이어 술래
        // ==================================

        if (
          !room.chaser
        ) {

          room.chaser =
            socket.id;


          console.log(
            '[CHASE404] CHASER_SELECTED',
            socket.id
          );

        }


        room.players[
          room.chaser
        ].it = true;


        socket.data.room =
          roomCode;


        // ==================================
        // 입장 성공
        // ==================================

        socket.emit(
          'joined',
          {

            id:
              socket.id,

            room:
              roomCode,

            x:
              room.players[
                socket.id
              ].x,

            z:
              room.players[
                socket.id
              ].z,

            rot:
              room.players[
                socket.id
              ].rot,

            player:
              room.players[
                socket.id
              ],

            obstacles:
              room.obstacles

          }
        );


        console.log(
          '[CHASE404] JOINED_SENT',
          socket.id,
          roomCode
        );


        // ==================================
        // 모든 플레이어에게 STATE
        // ==================================

        broadcastState(
          roomCode
        );

      }
    );


    // ==================================
    // 이동
    // ==================================

    socket.on(
      'move',
      p => {


        console.log(
          '[CHASE404] MOVE_RECEIVED',
          socket.id,
          p
        );


        const room =
          rooms.get(
            socket.data.room
          );


        if (
          !room ||
          !room.players[
            socket.id
          ]
        ) {


          console.log(
            '[CHASE404] MOVE_REJECTED',
            socket.id
          );


          return;

        }


        const me =
          room.players[
            socket.id
          ];


        const oldX =
          me.x;


        const oldZ =
          me.z;


        let newX =
          Number(
            p.x
          );


        let newZ =
          Number(
            p.z
          );


        if (
          !Number.isFinite(
            newX
          )
        ) {

          newX =
            oldX;

        }


        if (
          !Number.isFinite(
            newZ
          )
        ) {

          newZ =
            oldZ;

        }


        newX =
          clampPosition(
            newX
          );


        newZ =
          clampPosition(
            newZ
          );


        // ==================================
        // X 충돌
        // ==================================

        if (
          !isBlocked(
            newX,
            oldZ,
            room.obstacles
          )
        ) {

          me.x =
            newX;

        }


        // ==================================
        // Z 충돌
        // ==================================

        if (
          !isBlocked(
            me.x,
            newZ,
            room.obstacles
          )
        ) {

          me.z =
            newZ;

        }


        me.rot =
          Number(
            p.rot
          ) || 0;


        // ==================================
        // 술래 시스템
        // ==================================

        if (
          me.it
        ) {


          for (
            const [
              id,
              target
            ]
            of Object.entries(
              room.players
            )
          ) {


            if (
              id ===
              socket.id
            ) {

              continue;

            }


            if (
              target.it
            ) {

              continue;

            }


            const distance =
              Math.hypot(
                me.x -
                  target.x,

                me.z -
                  target.z
              );


            if (
              distance <
              1.7
            ) {


              target.it =
                true;


              me.it =
                false;


              room.chaser =
                id;


              console.log(
                '[CHASE404] CHASER_CHANGED',
                id
              );


              break;

            }

          }

        }


        // ==================================
        // STATE 전송
        // ==================================

        broadcastState(
          socket.data.room
        );

      }
    );


    // ==================================
    // 연결 종료
    // ==================================

    socket.on(
      'disconnect',
      () => {


        console.log(
          '[CHASE404] DISCONNECT',
          socket.id
        );


        const room =
          rooms.get(
            socket.data.room
          );


        if (!room) {

          return;

        }


        delete room.players[
          socket.id
        ];


        // ==================================
        // 술래가 나갔을 경우
        // ==================================

        if (
          room.chaser ===
          socket.id
        ) {


          const ids =
            Object.keys(
              room.players
            );


          room.chaser =
            ids[0] ||
            null;


          if (
            room.chaser
          ) {


            room.players[
              room.chaser
            ].it = true;


            console.log(
              '[CHASE404] NEW_CHASER',
              room.chaser
            );

          }

        }


        // ==================================
        // 방이 비었으면 삭제
        // ==================================

        if (
          Object.keys(
            room.players
          ).length ===
          0
        ) {


          rooms.delete(
            socket.data.room
          );


          console.log(
            '[CHASE404] ROOM_DELETED',
            socket.data.room
          );


          return;

        }


        // ==================================
        // 남은 플레이어에게 STATE
        // ==================================

        broadcastState(
          socket.data.room
        );

      }
    );

  }
);


// ======================================
// 서버 시작
// ======================================

const PORT =
  process.env.PORT ||
  3000;


server.listen(
  PORT,
  () => {

    console.log(
      `[CHASE404] SERVER_RUNNING`,
      'port:',
      PORT
    );

  }
);
```
