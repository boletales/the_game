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
var taimanRooms={};

app.get('/',function(req,res){
    res.sendFile(__dirname+'/docs/index.html');
});
app.get('/make.html',function(req,res){
    res.sendFile(__dirname+'/docs/make.html');
});
app.get('/rooms/:roomid',function(req,res){
    res.sendFile(__dirname+'/docs/game.html');
});
io.on('connection',function(socket){
    socket.join("robby");
    showRoomState();
    socket.on("makeRoom",data=>{
        makeRoomAndJoin(socket);
    });
    socket.on("joinRoom",data=>{
        joinRoom(data.roomname,socket,data.nickname,data.team);
    });
    socket.on("joinTaiman",data=>{
        joinTaiman(socket,data.nickname,data.team);
    });
    socket.on('robbyChat',function(data){
        io.to("robby").emit("message",data);
    }.bind(this));
});
http.listen(process.env.PORT || 80);
console.log('It works!!');

function randomID(keta){
    return ("0".repeat(keta)+Math.floor(Math.random()*Math.pow(10,keta))).slice(-keta);
}
function makeRoomAndJoin(socket){
    socket.emit("roomMade",{name:makeRoom()});
}
function makeRoom(){
    let keta=4;
    let roomname;
    do{roomname="room"+randomID(keta);}while(rooms.hasOwnProperty(roomname))
    rooms[roomname]=new Room(roomname);
    showRoomState();
    return roomname;
}
function joinRoom(roomname,socket,nickname,team){
    if(rooms.hasOwnProperty(roomname)){
        socket.join(roomname);
        if(rooms[roomname].join(socket,nickname,team)){
            showRoomState();
        }else{
            socket.emit("goRobby",{});
            socket.disconnect();
        }
    }else{
        socket.emit("goRobby",{});
    }
}
function joinTaiman(socket,nickname){
    let available=taimanRooms.filter(r=>r.game.players.length+r.game.waiting.length<2);
    if(available.length>0){
        var room=available[0];
    }else{
        let name=generateUuid();
        taimanRooms[name]=new TaimanRoom(name,taimanRooms);
    }
    room.join(socket,nickname,socket.id);
}

function showRoomState(){
    io.to("robby").emit("roomStates",Object.keys(rooms).map(k=>rooms[k]).map(room=>({name:room.name,number:room.getNumber()})));
}
class TaimanRoom extends Room{
    constructor(name,parent){
        super(name,parent,{teamMode:false,maxPlayers:2});
    }
}
class Room{
    constructor(name,parent,args={}){
        this._HP_DEFAULT=6;
        this.recentLog=[];
        this.recentLogMax=20;
        this.name=name;
        this.args=args;
        this.parent=parent;
        this.game=new _game.Game(_game._SKILLS_MOTO,this._HP_DEFAULT,args,this.closeGame.bind(this),this.okawari.bind(this),this.log.bind(this),this.showPlayers.bind(this));
    }
    getNumber(){
        if(io.sockets.adapter.rooms[this.name]==undefined)return 0;
        return Object.keys(io.sockets.adapter.rooms[this.name].sockets).length;
    }
    join(socket,nickname,team){
        if(!this.args.hasOwnProperty("teamMode")||this.args.teamMode){
            var newPlayer=(new Human(nickname,team,this.game,socket));
        }else{
            var newPlayer=(new Human(nickname,socket.id,this.game,socket));
        }
        if(this.game.joinPlayer(newPlayer)){
            socket.emit("joined",{"id":nickname,"team":team,"teamMode":this.teamMode});
            this.sendRecentLog(socket);
            this.log("connected:"+nickname);
            this.game.showPlayers();
            socket.on('chat',function(data){
                this.chat(data);
                if(data.message.startsWith("!")) this.command(data.message.slice(1));
            }.bind(this));
            socket.on('disconnect',((data)=>{
                this.game.players.filter(p=>p.hasOwnProperty("socket")).filter(p=>p.socket==socket).forEach(function(player){
                    this.log("disconnected:"+player.nickname);
                    this.game.killPlayer(player.nickname);
                }.bind(this));
                if(this.getNumber()==0)this.closeGame();
                showRoomState();
            }).bind(this));
            return true;
        }else{
            return false;
        }
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
                    others:players.filter(p=>p!==player).map(p=>({name:p.nickname,state:p.state(),team:p.team}))
                    ,you:{name:player.nickname,state:player.state(),team:player.team}
                });
        });
    }

    closeGame(){
        this.game.players.filter(p=>p.hasOwnProperty("socket")).map(player=>{
            player.socket.emit("goRobby",{});
        });
        delete this.parent[this.name];
    }

    okawari(){
        let newRoom=makeRoom();
        this.game.players.filter(p=>p.hasOwnProperty("socket")).map(player=>{
            player.socket.emit("goRoom",{name:newRoom});
        });
        delete this.parent[this.name];
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

function Human(nickname,team,game,socket){
    _game.Player.call(this,socket.id,nickname,team,game);
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

function generateUuid() {
    // https://github.com/GoogleChrome/chrome-platform-analytics/blob/master/src/internal/identifier.js
    // const FORMAT: string = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    let chars = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".split("");
    for (let i = 0, len = chars.length; i < len; i++) {
        switch (chars[i]) {
            case "x":
                chars[i] = Math.floor(Math.random() * 16).toString(16);
                break;
            case "y":
                chars[i] = (Math.floor(Math.random() * 4) + 8).toString(16);
                break;
        }
    }
    return chars.join("");
}