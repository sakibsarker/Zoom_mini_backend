const express=require('express');
const http=require('http');
const { v4: uuidv4}=require('uuid');
const cors=require('cors');
const twilio=require('twilio');

const PORT=process.env.PORT||5000;

const app=express();

const server=http.createServer(app);

app.use(cors());

let connectedUsers=[];
let rooms=[];

//route
app.get('/api/room-exists/:roomId',(req,res)=>{
    const {roomId}=req.params;
    const room=rooms.find(room=>room.id===roomId);
    
    if(room){
        if(room.connectedUsers.length>3){
            return res.send({roomExists:true,full:true});
        }else{
            return res.send({roomExists:true,full:false});
        }
    }else{
        return res.send({roomExists:false})
    }
})

const io=require('socket.io')(server,{
    cors:{
        origin:'*',
        methods:['GET','POST']
    }
});

io.on('connection',(socket)=>{
    console.log(`user connected ${socket.id}`);
    socket.on('create-new-room',(data)=>{
       createNewRoomHandler(data,socket);
    })
    socket.on('join-room',(data)=>{
        joinRoomHandler(data,socket);
    })

    socket.on('disconnect',()=>{
        disconnectHandler(socket);
    });

    socket.on('conn-signal',data=>{
        signalingHandler(data,socket);
    });

    socket.on('conn-init',(data)=>{
        initializeConnectionHandler(data,socket);
    })
});

//socket io handlers

const createNewRoomHandler=(data,socket)=>{
    console.log('Host is creating new room');
    console.log(data);
    const {identity}=data;

    const roomId=uuidv4();

    //create new user
    
    const newUser={
        identity,
        id:uuidv4(),
        socketId:socket.id,
        roomId
    }
    //push the user
    connectedUsers=[...connectedUsers,newUser];

    //create new room 
    const newRoom={
        id:roomId,
        connectedUsers:[newUser]
    }
    // join socket io room
    socket.join(roomId);

    rooms=[...rooms,newRoom];

    //emit to that client which created that room roomId
    socket.emit('room-id',{roomId});

    //emit an event to all users connected 

    // to  that room about new user which are right in this room
    socket.emit('room-update',{connectedUsers:newUser});
   

};

const joinRoomHandler=(data,socket)=>{
    const {identity,roomId}=data;
    const newUser={
        identity,
        id: uuidv4(),
        socketId: socket.id,
        roomId
    }

    //join room as user which just is trying to join room passing room id
    const room=rooms.find(room=>room.id===roomId);
    room.connectedUsers=[...room.connectedUsers,newUser];

    //join socket.io room
    socket.join(roomId);
    
    //add new user to connected users array
  
    connectedUsers=[...connectedUsers,newUser];
    //emit to all users which are already in this room to prepare peer connection

    room.connectedUsers.forEach(user=>{
        if(user.socketId!==socket.id){
            const data={
                connUserSocketId: socket.id,
            };
            io.to(user.socketId).emit('conn-prepare',data);
        }
    })

    io.to(roomId).emit('room-update',{connectedUsers: room.connectedUsers});

}

const disconnectHandler=(socket)=>{
    //find if user has been registered if yes remove his form room and connected users array
    const user=connectedUsers.find((user)=>user.socketId===socket.id);
    if(user){
        //remove user from room in server
        const room=rooms.find(room=>room.id===user.roomId);
        room.connectedUsers=room.connectedUsers.filter(user=>user.socketId!==socket.id);

        //leave socket io room
        socket.leave(user.roomId);


        //todo
        //close the room if amount of the user which will stay in room will be 0
        if(room.connectedUsers.length>0){
            //emit to all users which are still in the room tha user is disconnected
            io.to(room.id).emit('user-disconnected',{socketId: socket.id});

            //emit an event to rest of the users which left in the room new connected user in room
            io.to(room.id).emit('room-update',{
                connectedUsers: room.connectedUsers,
            })
        }else{
            rooms=rooms.filter((r)=>r.id !==room.id);

        }

    }
}

const signalingHandler=(data,socket)=>{
    const { connUserSocketId,signal }=data;
    
    const signalingData={signal,connUserSocketId: socket.id};
    io.to(connUserSocketId).emit('conn-signal',signalingData);
}

//information from client which are alreay in room that they have prepared for incoming connection

const initializeConnectionHandler=(data,socket)=>{
    const {connUserSocketId}=data;
    
    const initData={connUserSocketId:socket.id};
    io.to(connUserSocketId).emit('conn-init',initData);
}

server.listen(PORT,()=>{
    console.log(`Server is listening on http://localhost:${PORT}`);
})