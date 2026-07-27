const express=require('express');
const http=require('http');
const path=require('path');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static(path.join(__dirname,'public')));
const rooms=new Map(),MAX_PLAYERS=16;
function code(){return Math.random().toString(36).slice(2,7).toUpperCase()}
io.on('connection',socket=>{
 socket.on('joinRoom',requested=>{
  const roomCode=requested||code();
  if(!rooms.has(roomCode))rooms.set(roomCode,{players:{},chaser:null});
  const room=rooms.get(roomCode);
  if(Object.keys(room.players).length>=MAX_PLAYERS)return socket.emit('errorMessage','방이 가득 찼습니다.');
  socket.data.room=roomCode;
  room.players[socket.id]={x:Math.random()*20-10,z:Math.random()*20-10,rot:0,it:false};
  if(!room.chaser)room.chaser=socket.id;
  room.players[room.chaser].it=true;
  socket.emit('joined',{id:socket.id,room:roomCode});
  io.to(roomCode).emit('state',{players:room.players,chaser:room.chaser});
 });
 socket.on('move',p=>{
  const room=rooms.get(socket.data.room);if(!room||!room.players[socket.id])return;
  const me=room.players[socket.id];
  me.x=Math.max(-47,Math.min(47,Number(p.x)||0));me.z=Math.max(-47,Math.min(47,Number(p.z)||0));me.rot=Number(p.rot)||0;
  if(me.it)for(const [id,target] of Object.entries(room.players)){if(id!==socket.id&&!target.it&&Math.hypot(me.x-target.x,me.z-target.z)<1.7){target.it=true;me.it=false;room.chaser=id;break}}
  io.to(socket.data.room).emit('state',{players:room.players,chaser:room.chaser});
 });
 socket.on('disconnect',()=>{
  const room=rooms.get(socket.data.room);if(!room)return;
  delete room.players[socket.id];
  if(room.chaser===socket.id){const ids=Object.keys(room.players);room.chaser=ids[0]||null;if(room.chaser)room.players[room.chaser].it=true}
  if(!Object.keys(room.players).length)rooms.delete(socket.data.room);
  else io.to(socket.data.room).emit('state',{players:room.players,chaser:room.chaser});
 });
});
server.listen(process.env.PORT||3000);