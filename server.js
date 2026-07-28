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


// 랜덤 방 코드

function createRoomCode() {
  return Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase();
}


// 맵에 사용할 고정 조형물 생성

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

    {x:-30,z:-25,w:5,d:5},
    {x:-18,z:-12,w:7,d:4},
    {x:-5,z:-30,w:4,d:7},
    {x:10,z:-22,w:6,d:6},

    {x:25,z:-30,w:5,d:5},
    {x:32,z:-10,w:7,d:4},

    {x:-32,z:5,w:5,d:7},
    {x:-18,z:20,w:6,d:5},

    {x:0,z:10,w:5,d:5},
    {x:12,z:25,w:7,d:4},

    {x:28,z:18,w:5,d:6},
    {x:35,z:35,w:6,d:6},

    {x:-30,z:35,w:5,d:5},
    {x:-8,z:38,w:7,d:4}

  ];


  for(
    const obj of fixedObjects
  ){

    obstacles.push(obj);

  }


  return obstacles;
}


// 충돌 검사

function isBlocked(
  x,
  z,
  obstacles
){

  const radius = 0.7;


  for(
    const o of obstacles
  ){

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


    if(
      x > minX &&
      x < maxX &&
      z > minZ &&
      z < maxZ
    ){

      return true;

    }

  }


  return false;

}


// 플레이어가 이동 가능한 위치로 제한

function clampPosition(
  value
){

  return Math.max(
    -47,
    Math.min(
      47,
      value
    )
  );

}


io.on(
  'connection',
  socket => {


    // 방 참가

    socket.on(
      'joinRoom',
      requestedRoom => {


        const roomCode =
        requestedRoom ||
        createRoomCode();


        if(
          !rooms.has(roomCode)
        ){

          rooms.set(
            roomCode,
            {
              players:{},
              chaser:null,

              // 방마다 같은 맵 사용
              obstacles:createMap()
            }
          );

        }


        const room =
        rooms.get(roomCode);


        const playerCount =
        Object.keys(
          room.players
        ).length;


        if(
          playerCount >= MAX_PLAYERS
        ){

          socket.emit(
            'errorMessage',
            '방이 가득 찼습니다.'
          );

          return;

        }


        // 플레이어 시작 위치

        let startX = 0;
        let startZ = 0;


        // 충돌 없는 위치 찾기

        for(
          let i = 0;
          i < 50;
          i++
        ){

          const testX =
          Math.random()*20-10;

          const testZ =
          Math.random()*20-10;


          if(
            !isBlocked(
              testX,
              testZ,
              room.obstacles
            )
          ){

            startX = testX;
            startZ = testZ;

            break;

          }

        }


        room.players[
          socket.id
        ] = {

          x:startX,
          z:startZ,

          rot:0,

          it:false

        };


        // 첫 번째 플레이어가 술래

        if(
          !room.chaser
        ){

          room.chaser =
          socket.id;

        }


        room.players[
          room.chaser
        ].it = true;


        socket.data.room =
        roomCode;


        // 입장 성공

        socket.emit(
          'joined',
          {
            id:socket.id,

            room:roomCode,

            // 같은 맵 전달
            obstacles:room.obstacles
          }
        );


        // 모든 플레이어에게 상태 전송

        io.to(
          roomCode
        ).emit(
          'state',
          {
            players:room.players,

            chaser:room.chaser,

            obstacles:room.obstacles
          }
        );

      }
    );


    // 이동

    socket.on(
      'move',
      p => {


        const room =
        rooms.get(
          socket.data.room
        );


        if(
          !room ||
          !room.players[
            socket.id
          ]
        ){

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
        Number(p.x);


        let newZ =
        Number(p.z);


        if(
          !Number.isFinite(
            newX
          )
        ){

          newX =
          oldX;

        }


        if(
          !Number.isFinite(
            newZ
          )
        ){

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


        // 서버에서도 충돌 확인

        // X 이동

        if(
          !isBlocked(
            newX,
            oldZ,
            room.obstacles
          )
        ){

          me.x =
          newX;

        }


        // Z 이동

        if(
          !isBlocked(
            me.x,
            newZ,
            room.obstacles
          )
        ){

          me.z =
          newZ;

        }


        me.rot =
        Number(p.rot) || 0;


        // 술래 판정

        if(
          me.it
        ){


          for(
            const [
              id,
              target
            ]
            of Object.entries(
              room.players
            )
          ){


            if(
              id === socket.id
            ){

              continue;

            }


            if(
              target.it
            ){

              continue;

            }


            const distance =
            Math.hypot(
              me.x -
              target.x,

              me.z -
              target.z
            );


            if(
              distance < 1.7
            ){


              target.it =
              true;

              me.it =
              false;


              room.chaser =
              id;


              break;

            }

          }

        }


        // 업데이트

        io.to(
          socket.data.room
        ).emit(
          'state',
          {
            players:room.players,

            chaser:room.chaser,

            obstacles:room.obstacles
          }
        );

      }
    );


    // 접속 종료

    socket.on(
      'disconnect',
      () => {


        const room =
        rooms.get(
          socket.data.room
        );


        if(
          !room
        ){

          return;

        }


        delete room.players[
          socket.id
        ];


        // 술래가 나갔다면
        // 다른 플레이어를 술래로 지정

        if(
          room.chaser ===
          socket.id
        ){


          const ids =
          Object.keys(
            room.players
          );


          room.chaser =
          ids[0] ||
          null;


          if(
            room.chaser
          ){

            room.players[
              room.chaser
            ].it = true;

          }

        }


        // 아무도 없으면 방 삭제

        if(
          Object.keys(
            room.players
          ).length === 0
        ){

          rooms.delete(
            socket.data.room
          );

          return;

        }


        // 남은 플레이어에게 알림

        io.to(
          socket.data.room
        ).emit(
          'state',
          {
            players:room.players,

            chaser:room.chaser,

            obstacles:room.obstacles
          }
        );

      }
    );

  }
);


// 서버 시작

const PORT =
  process.env.PORT ||
  3000;

server.listen(
  PORT,
  () => {
    console.log(
      `CHASE 404 server running on port ${PORT}`
    );
  }
);
