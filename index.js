const _game=require("./game.js");
const express=require('express');
const app=express();
const http=require('http').createServer(app);
const socketIO=require('socket.io');
const io=socketIO.listen(http);
const _aidata=require("./aidata.js");
const crypto = require('crypto');
const os = require('os');
const svg2img = require("svg2img");
const request = require('request');

var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(40);
rooms={};

let globalRecentLog=[];
let globalRecentLogMax=20;

request.get({
    url: process.env.chakra_ranking_url+"/public.pem",
}, function (error, response, body){rankingPublicKey=body;});

function forceHttps(req, res, next){
    if (!process.env.chakra_force_https) {
        return next();
    };

    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] === "http") {
        res.redirect('https://' + req.headers.host + req.url);
    }else {
        return next();
    }
};

if( process.env.hasOwnProperty("chakra_ranking_enable") &&
    process.env.hasOwnProperty("chakra_ranking_url") &&
    process.env.chakra_ranking_enable=="true"){

    
    app.post('/',function(req,res){
        let verifier=crypto.createVerify("RSA-SHA256");
        verifier.update(req.body.data);
        console.log(verifier.verify(rankingPublicKey, req.body.sign, 'base64'));

        res.sendFile(__dirname+'/docs/index.html');
    });
}


app.all('*', forceHttps);
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
app.get('/favicon.ico',function(req,res){
    sendFavicon(req,res,64);
});
app.get('/apple-touch-icon.png',function(req,res){
    sendFavicon(req,res,180);
});
app.get('/android-touch-icon.png',function(req,res){
    sendFavicon(req,res,192);
});


app.use(express.json())
app.use(express.urlencoded({ extended: true }));

function sendFavicon(req,res,size){
    if(!process.env.chakra_server_name){
        var serverColor="#000";
    }else{
        let serverColorMoto = crypto.createHash('sha256').update(process.env.chakra_server_name, 'utf8').digest("hex");
        var serverColor=genServerColor(parseInt(serverColorMoto.slice(0,2),16),parseInt(serverColorMoto.slice(2,4),16));
    }
    console.log("color:"+serverColor+"("+req.headers.host+")");
    let svg='<svg xmlns="http://www.w3.org/2000/svg" height="9" width="9"><text x="0" y="8" fill="'+serverColor+'">☯</text></svg>';
    
    svg2img(svg,{width:size,height:size},function(error,buffer){
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': buffer.length,
            'Expires': new Date().toUTCString()
        });
        res.end(buffer);
    });
}

function genServerColor(num1,num2){
    let decToHex2=(dec=>("00"+Math.floor(dec).toString(16)).slice(-2));
    let bri=Math.floor(num2/2)+64;
    let hue=num1*6;
    let phue=decToHex2(     (hue%256) *(bri/256));
    let mhue=decToHex2((256-(hue%256))*(bri/256));
    let _BRI=decToHex2(bri);
    switch (true) {
        case hue<256*1:
            return "#"+_BRI+phue+"00";
        case hue<256*2:
            return "#"+mhue+_BRI+"00";
        case hue<256*3:
            return "#"+"00"+_BRI+phue;
        case hue<256*4:
            return "#"+"00"+mhue+_BRI;
        case hue<256*5:
            return "#"+phue+"00"+_BRI;
        case hue<256*6:
            return "#"+_BRI+"00"+mhue;
        default:
            return "#"+_BRI+"00"+"00";
    }
}
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
        this.recentLogMax=1000;
        this.name=name;
        this.id=generateUuid();
        this.args=args;
        this.taiman=this.args.taiman;
        this.parent=parent;
        this.kits=_game.kitsets.hasOwnProperty(args.kitsname)?_game.kitsets[args.kitsname]:_game.kitsets["スタンダード"];
        this.hidden=args.hasOwnProperty("hidden")&&args.hidden;
	    this.game=new _game.Game(this.kits,args,this.closeGame.bind(this),this.okawari.bind(this),this.log.bind(this),this.showPlayers.bind(this),()=>{},true,this.sendBattleLogToLogger.bind(this));
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
        let kit=this.kits.set.hasOwnProperty(kitid)?this.kits.set[kitid]:this.kits.set[0];
        let showJobMark=(Object.keys(this.kits.set).length>1);
	    if(!this.args.hasOwnProperty("teamMode")||this.args.teamMode){
            var newPlayer=(new Human(nickname,team,this.game,socket,kit,showJobMark));
        }else{
            var newPlayer=(new Human(nickname,socket.id,this.game,socket,kit,showJobMark));
        }
        this.log("connected:"+newPlayer.getShowingName());
        if(this.game.joinPlayer(newPlayer)){
            socket.emit("joined",{"id":newPlayer.getShowingName(),"team":team,"teamMode":this.teamMode});
            socket.on('chat',function(data){
                this.chat([data]);
                if(data.message.startsWith("!")) this.command(data.message.slice(1));
            }.bind(this));
            socket.on('disconnect',((data)=>{
                this.game.players.filter(p=>p.hasOwnProperty("socket")).filter(p=>p.socket==socket).forEach(function(player){
                    this.log("disconnected:"+player.getShowingName());
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
            kits:Object.keys(this.kits.set).reduce((a,c)=>{a[c]=this.kits.set[c];return a;},{})
        });
    }

    log(str){
        this.chat(str.split("\n").map(s=>({"name":"★system","message":s})));
    }

    sendBattleLogToLogger(data){
        if(process.env.hasOwnProperty("chakra_ranking_enable") && process.env.hasOwnProperty("chakra_ranking_url") && process.env.chakra_ranking_enable=="true"){
            request.post({
                url: process.env.chakra_ranking_url+"/log",
                headers: {
                    "content-type": "plain/text"
                },
                body: JSON.stringify({
                    "host":process.env.hasOwnProperty("chakra_server_name")?process.env.chakra_server_name:"unknown",
                    "id":this.id,
                    "data":data,
                }, null , "\t")
            }, function (error, response, body){console.log(body);});
        }
    }

    chat(data){
        data.forEach(d=>{
            d.time=new Date();
            process.stdout.write(this.name+":"+d.name+"≫"+d.message+"\n");
            this.recentLog.push(d);
            if(this.recentLog.length>this.recentLogMax)this.recentLog.shift();
        });
        io.to(this.id).emit("messagebulk",{messages:data}); 
    }

    sendRecentLog(socket){
        socket.emit("messagebulk",{messages:this.recentLog}); 
    }

    showPlayers(players){
        players.concat(this.game.deadPlayers).filter(p=>p.hasOwnProperty("socket")).map(player=>{
            player.socket.emit("showPlayers",
                {
                    others:  players.filter(p=>p.team==player.team).filter(p=>p!==player)
                                    .concat(players.filter(p=>p.team!=player.team))
                                    .map(p=>({name:p.getShowingName(),state:p.getState(),team:p.team}))
                    ,you:{name:player.getShowingName(),state:player.getState(),team:player.team}
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
        rooms[roomid].recentLog=this.recentLog.concat([{name:"",message:""},{name:"",message:""},{name:"",message:"*".repeat(30)},{name:"",message:"...次の試合..."},{name:"",message:"*".repeat(30)},{name:"",message:""},{name:"",message:""},]);
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

function Human(nickname,team,game,socket,kit,showJobMark){
    _game.Player.call(this,socket.id,nickname,team,game,kit,showJobMark);
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

function strBytes(str) {
    return(encodeURIComponent(str).replace(/%../g,"x").length);
}
