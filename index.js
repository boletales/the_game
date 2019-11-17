const _game=require("./game.js");
const app=require('express')();
const http=require('http').createServer(app);
const socketIO=require('socket.io');
const io=socketIO.listen(http);
const _aidata=require("./aidata.js");

var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(40);
rooms={};

let globalRecentLog=[];
let globalRecentLogMax=20;

app.get('/',function(req,res){
    res.sendFile(__dirname+'/docs/index.html');
});
app.get('/explain.html',function(req,res){
    res.sendFile(__dirname+'/docs/explain.html');
});
app.get('/main.css',function(req,res){
    res.sendFile(__dirname+'/docs/main.css');
});
app.get('/make.html',function(req,res){
    res.sendFile(__dirname+'/docs/make.html');
});
app.get('/rooms/:roomid',function(req,res){
    res.sendFile(__dirname+'/docs/game.html');
});
app.get('/rooms/join/:roomid',function(req,res){
    res.sendFile(__dirname+'/docs/join.html');
});
app.get('/rooms/spectate/:roomid',function(req,res){
    res.sendFile(__dirname+'/docs/spectate.html');
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
        joinRoom(data.roomid,socket,data.nickname,data.team,data.kitid);
    });
    socket.on("spectate",data=>{
        socket.join(data.roomid);
    });
    socket.on("joinTaiman",data=>{
        joinTaiman(socket);
    });
    socket.on("joinAiman",data=>{
        joinAiman(socket);
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
            rooms[data.id].showData(socket);
        }
    });
    socket.on("getKitsset",data=>{
        socket.emit("kitsset",Object.keys(_game.kitsets));
    });
});
if(process.env.HAS_HTTPS=="true"){
    http.createServer((express()).all("*", function (request, response) {
        response.redirect(`https://${request.hostname}${request.url}`);
    })).listen(process.env.PORT || 80);
}else{
    http.listen(process.env.PORT || 80);
}
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
    socket.emit("goJoin",{id:makeRoom(name,args)});
}
function joinRoom(roomid,socket,nickname,team,kitid){
    if(rooms.hasOwnProperty(roomid)){
        socket.join(roomid);
        if(rooms[roomid].join(socket,nickname,team,kitid)){
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
    socket.emit("goJoin",{id:room.id});
}

function joinAiman(socket){
    let trooms=Object.values(rooms).filter(r=>r.aiman);
    let name="AIタイマン"+("000"+(trooms.length+1)).slice(-3);
    var room=new AimanRoom(name,rooms);
    rooms[room.id]=room;
    socket.emit("goRoom",{id:room.id+"?nickname=名無し&team=名無し&kit=0"});
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
        this.kits=_game.kitsets.hasOwnProperty(args.kitsname)?_game.kitsets[args.kitsname]:_game.kitsets["スタンダード"];
        this.hidden=args.hasOwnProperty("hidden")&&args.hidden;
	    this.game=new _game.Game(this.kits,args,this.closeGame.bind(this),this.okawari.bind(this),this.log.bind(this),this.showPlayers.bind(this));
        this.teamMode=this.game.teamMode;
    }
    getNumber(){
        if(io.sockets.adapter.rooms[this.id]==undefined){
            delete rooms[this.id];
            return 0;
        }
        return Object.keys(io.sockets.adapter.rooms[this.id].sockets).length;
    }
    join(socket,nickname,team,kitid){
        let kit=this.kits.hasOwnProperty(kitid)?this.kits[kitid]:this.kits[0];
        if(!this.args.hasOwnProperty("teamMode")||this.args.teamMode){
            var newPlayer=(new Human(nickname,team,this.game,socket,kit));
        }else{
            var newPlayer=(new Human(nickname,socket.id,this.game,socket,kit));
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
        socket.emit("roomData",{
            name:this.name,
            teamMode:this.game.teamMode,
            available:this.game.aki(),
            kits:Object.keys(this.kits).reduce((a,c)=>{a[c]=this.kits[c];return a;},{})
        });
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
        let roomid=makeRoom(this.name,this.args);
        if(io.sockets.adapter.rooms[this.id]!=undefined){
            let humans=Object.keys(io.sockets.adapter.rooms[this.id].sockets);
            let aicount=this.game.players.filter(p=>p.isAI).length+this.game.deadPlayers.filter(p=>p.isAI).length;
            rooms[roomid].game.setStartnumber(Math.max(2,humans.length+aicount));
            humans.map(((roomid,socketid)=>{
                let socket=io.sockets.sockets[socketid];
                let player=this.game.players.concat(this.game.deadPlayers).find(p=>p.socket==socket);
                if(player){
                    socket.emit("okawari",{nickname:player.nickname,team:player.team,roomid:roomid});
                }else{
                    socket.emit("okawari",{roomid:roomid});
                } 
            }).bind(null,roomid));
            for(let i=0;i<aicount;i++){
                let id=Math.floor(Math.random()*_aidata.data.length);
                rooms[roomid].game.joinPlayer(new _game.TaimanAi("名無しAI🤖"+id,this.game,_aidata.data[id]));
            }
        }
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

class AimanRoom extends Room{
    constructor(name,parent){
        super(name,parent,{teamMode:false,maxPlayers:2,hidden:true,aiman:true});
        let id=Math.floor(Math.random()*_aidata.data.length);
        this.game.joinPlayer(new _game.TaimanAi("名無しAI🤖"+id,this.game,_aidata.data[id]));
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

function Human(nickname,team,game,socket,kit){
    _game.Player.call(this,socket.id,nickname,team,game,kit);
    this.socket=socket;
    this.isHuman=true;
    this.reqDecisionWrapped=function(callBack,candidates){
        this.socket.emit('input_action',{"candidates":candidates});
        this.onAction=function(data){
            callBack(this.game.genDecision(data.action,this));
        }.bind(this);
    }.bind(this);
    this.onAction=function(){};
    this.socket.on("action",function(data){
        this.onAction(data)
    }.bind(this));
    this.clearCommand=function(){
        this.socket.on("action",function(){});
        this.socket.emit("clear_command",{});
    }
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
