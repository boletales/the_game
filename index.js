const _game=require("./game.js");
const app=require('express')();
const http=require('http').createServer(app);
const socketIO=require('socket.io');
const io=socketIO.listen(http);
const _TIMEOUT_SECONDS=240;
var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(40);
rooms={};

let globalRecentLog=[];
let globalRecentLogMax=20;

app.get('/',function(req,res){
    res.sendFile(__dirname+'/docs/index.html');
});
app.get('/make.html',function(req,res){
    res.sendFile(__dirname+'/docs/make.html');
});
app.get('/rooms/:roomid',function(req,res){
    res.sendFile(__dirname+'/docs/game.html');
});
app.get('/clear',function(req,res){
    globalRecentLog=[];
    rooms={};
    io.emit("goRobby",{});
    res.redirect('/');
});
io.on('connection',function(socket){
    socket.join("robby");
    showRoomState();
    socket.on("makeRoom",data=>{
        makeRoomAndJoin(socket,data.name,data.args);
    });
    socket.on("joinRoom",data=>{
        joinRoom(data.roomid,socket,data.nickname,data.team);
    });
    socket.on("joinTaiman",data=>{
        joinTaiman(socket);
    });
    socket.on('globalChat',function(data){
        io.emit("globalMessage",data);
        globalRecentLog.push(data);
        if(globalRecentLog.length>globalRecentLogMax)globalRecentLog.shift();
    });
    socket.on('getGlobalLog',function(data){
        sendGlobalRecentLog(socket);
    });
    socket.on("getRoomData",data=>{
        if(rooms.hasOwnProperty(data.id)){
            socket.emit(rooms[data.id].showData(socket));
        }
    });
});
http.listen(process.env.PORT || 80);
console.log('It works!!');

function sendGlobalRecentLog(socket){
    globalRecentLog.forEach(data=>
            socket.emit("globalMessage",data)
        ); 
}

function randomID(keta){
    return ("0".repeat(keta)+Math.floor(Math.random()*Math.pow(10,keta))).slice(-keta);
}
function makeRoom(name,args){
    let r=new Room(name,rooms,args);
    rooms[r.id]=r;
    return r.id;
}
function makeRoomAndJoin(socket,name,args){
    socket.emit("goRoom",{id:makeRoom(name,args)});
}
function joinRoom(roomid,socket,nickname,team){
    if(rooms.hasOwnProperty(roomid)){
        socket.join(roomid);
        if(rooms[roomid].join(socket,nickname,team)){
            showRoomState();
        }else{
            socket.emit("goRobby",{});
            socket.disconnect();
        }
    }else{
        socket.emit("goRobby",{});
    }
}
function joinTaiman(socket){
    let trooms=Object.values(rooms).filter(r=>r.taiman);
    let available=trooms.filter(r=>r.game.countJoined()<2);
    if(available.length>0){
        var room=available[0];
    }else{
        let name="タイマン"+("000"+(trooms.length+1)).slice(-3);
        var room=new TaimanRoom(name,rooms);
        rooms[room.id]=room;
    }
    socket.emit("goRoom",{id:room.id});
}

function showRoomState(){
    var avr= Object.values(rooms).filter(r=>r.game.countJoined()>0);
    io.to("robby").emit("roomStates",{
        rooms:  avr.filter(room=>!room.hidden).map(room=>({name:room.name,id:room.id,number:room.getNumber()})),
        taiman: avr.filter(r=>r.taiman).filter(r=>r.game.countJoined()<2).length>0,
    });
}
class Room{
    constructor(name,parent,args={}){
        this.recentLog=[];
        this.recentLogMax=20;
        this.name=name;
        this.id=generateUuid();
        this.args=args;
        this.taiman=this.args.taiman;
        this.parent=parent;
        this.hidden=args.hasOwnProperty("hidden")&&args.hidden;
        this.game=new _game.Game(_game._SKILLS_MOTO,args,this.closeGame.bind(this),this.okawari.bind(this),this.log.bind(this),this.showPlayers.bind(this));
        this.teamMode=this.game.teamMode;
    }
    getNumber(){
        if(io.sockets.adapter.rooms[this.id]==undefined){
            delete rooms[this.id];
            return 0;
        }
        return Object.keys(io.sockets.adapter.rooms[this.id].sockets).length;
    }
    join(socket,nickname,team){
        if(!this.args.hasOwnProperty("teamMode")||this.args.teamMode){
            var newPlayer=(new Human(nickname,team,this.game,socket));
        }else{
            var newPlayer=(new Human(nickname,socket.id,this.game,socket));
        }
        if(this.game.joinPlayer(newPlayer)){
            socket.emit("joined",{"id":nickname,"team":team,"teamMode":this.teamMode});
            this.log("connected:"+nickname);
            socket.on('chat',function(data){
                this.chat(data);
                if(data.message.startsWith("!")) this.command(data.message.slice(1));
            }.bind(this));
            socket.on('disconnect',((data)=>{
                this.game.players.filter(p=>p.hasOwnProperty("socket")).filter(p=>p.socket==socket).forEach(function(player){
                    this.log("disconnected:"+player.nickname);
                    this.game.killPlayer(player.id);
                }.bind(this));
                if(this.getNumber()==0)this.closeGame();
                showRoomState();
            }).bind(this));
            return true;
        }else{
            return false;
        }
    }
    
    showData(socket){
        this.sendRecentLog(socket);
        this.game.showPlayers();
        socket.emit("roomData",{name:this.name,teamMode:this.game.teamMode,available:this.game.aki()});
    }

    log(str){
        this.chat({"name":"★system","message":str});
    }

    chat(data){
        data.time=new Date();
        io.to(this.id).emit('message',data);
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
        if(rooms[this.name]==this){
            delete rooms[this.name];
        }
    }

    okawari(){
        this.game.players.filter(p=>p.hasOwnProperty("socket")).map(player=>{
            player.socket.emit("okawari",{nickname:player.nickname,team:player.team});
        });
        makeRoom(this.name,this.args);
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
class TaimanRoom extends Room{
    constructor(name,parent){
        super(name,parent,{teamMode:false,maxPlayers:2,hidden:true,taiman:true});
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
    this.isHuman=true;
    this.sleepcount=0;
    this.reqDecision=function(callBack){
        this.game.reqCommandPlayer(this,[],[{message:"行動入力",type:"action"}],undefined,callBack);
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
