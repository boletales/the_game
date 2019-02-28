const _game=require("./game.js");
const app=require('express')();
const http=require('http').createServer(app);
const socketIO=require('socket.io');
const io=socketIO.listen(http);
const _TIMEOUT_SECONDS=240;
var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(40);
var rooms={};

app.get('/',function(req,res){
    res.sendFile(__dirname+'/docs/index.html');
});
app.get('/rooms/:roomid',function(req,res){
    res.sendFile(__dirname+'/docs/game.html');
});
io.on('connection',function(socket){
    showRoomState();
    socket.on("makeRoom",data=>{
        makeRoom(socket);
    });
    socket.on("joinRoom",data=>{
        joinRoom(data.roomname,socket,data.nickname);
    });
});
http.listen(process.env.PORT || 80);
console.log('It works!!');

function randomID(keta){
    return ("0".repeat(keta)+Math.floor(Math.random()*Math.pow(10,keta))).slice(-keta);
}
function makeRoom(socket){
    let keta=4;
    let roomname="room"+randomID(keta);
    rooms[roomname]=new Room(roomname);
    showRoomState();
    socket.emit("roomMade",{name:roomname});
}
function joinRoom(roomname,socket,nickname){
    if(rooms.hasOwnProperty(roomname)){
        socket.join(roomname);
        rooms[roomname].join(socket,nickname);
        showRoomState();
    }else{
        socket.emit("goRobby",{});
    }
}

function showRoomState(){
    io.emit("roomStates",Object.keys(rooms).map(k=>rooms[k]).map(r=>({name:r.name,number:r.game.players.length})));
}
class Room{
    constructor(name){
        this._HP_DEFAULT=6;
        this.recentLog=[];
        this.recentLogMax=20;
        this.name=name;
        this.game=new _game.Game(_game._SKILLS_MOTO,this._HP_DEFAULT,this.resetGame.bind(this),this.log.bind(this),this.showPlayers.bind(this));
    }
    join(socket,nickname){
        this.sendRecentLog(socket);
        socket.emit("joined",{"id":nickname});
        this.log("connected:"+nickname);
        this.game.joinPlayer(new Human(nickname,this.game,socket));
    
        socket.on('chat',function(data){
            this.chat(data);
            if(data.message.startsWith("!")) this.command(data.message.slice(1));
        });
        socket.on('disconnect',(data)=>{
            this.game.players.filter(p=>p.hasOwnProperty("socket")).filter(p=>p.socket==socket).forEach(function(player){
                this.log("disconnected:"+player.nickname);
                this.game.killPlayer(player.id);
            });
            showRoomState();
        });
    }
    
    log(str){
        this.chat({"name":"★system","message":str});
    }

    chat(data){
        data.time=new Date();
        io.to(this.name).emit('message',data);
        process.stdout.write(this.name+":"+data.name+"≫"+data.message+"\n");
        this.recentLog.push(data);
        if(this.recentLog.length>this.recentLogMax)this.recentLog.shift();
    }

    sendRecentLog(socket){
        this.recentLog.forEach(data=>
                socket.emit("message",data)
            ); 
    }

    showPlayers(players){
        players.filter(p=>p.hasOwnProperty("socket")).map(player=>{
            player.socket.emit("showPlayers",
                {
                    others:players.filter(p=>p!==player).map(p=>({name:p.nickname,state:p.state()}))
                    ,you:{name:player.nickname,state:player.state()}
                });
        });
    }

    resetGame(){
        this.game.players.filter(p=>p.hasOwnProperty("socket")).map(player=>{
            player.socket.emit("goRobby",{});
        });
        delete this.game;
        rooms=rooms.filter(r=>r.name!=this.name);
    }

    command(_com){
        let com=_com.split(" ");
        switch (com[0]) {
            case "reset":
                resetGame();
                break;

            case "kick":
                if(this.game!=undefined && this.game.killPlayer!=undefined)(this.game.killPlayer(com[1]));
                break;

            case "startnumber":
                if(this.game!=undefined && this.game.setStartnumber!=undefined)(this.game.setStartnumber(parseInt(com[1])));
                break;
        
            default:
                break;
        }
    }
}
/*function resetGame(){
    recentLog=[];
    delete game;
    game=new _game.Game(_SKILLS_MOTO,_HP_DEFAULT,resetGame,log,showPlayers);
    Object.keys(io.sockets.connected).forEach(k=>{
        let socket=io.sockets.connected[k];
        let id="guest"+Math.floor(Math.random()*10000);
        socket.emit("reset",{"id":id});
        log("connected:"+id);
        game.joinPlayer(new Human(id,game,socket),false);
    });
    game.setStartnumber(game.startnumber);
}*/

function Human(nickname,game,socket){
    _game.Player.call(this,socket.id,nickname,game);
    this.socket=socket;
    this.sleepcount=0;
    this.input=function(callBack){
        /*let timeout=setTimeout(function(callBack){
            this.clearCommand();
            this.sleepcount++;
            if(this.sleepcount>=2){this.hp=0;}
            callBack(new _game.decision([this.game._SKILLS.non]));
        }.bind(this,callBack),_TIMEOUT_SECONDS*1000);*/
        this.game.commandInput(this,[],[{message:"行動入力",type:"action"}],undefined,callBack/*,timeout*/);
    }.bind(this);
    this.onCommand=function(){};
    this.reqCommand=function(onCommand,message,commands){
        this.socket.emit('input_command',{"message":message,"commands":commands});
        this.onCommand=onCommand;
    }
    this.clearCommand=function(){
        this.socket.on("command",function(){});
        this.socket.emit("clear_command",{});
    }
    this.socket.on("command",function(data){
        this.onCommand(data.command)
    }.bind(this));
}
