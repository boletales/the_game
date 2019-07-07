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

function joinAiman(socket){
    let trooms=Object.values(rooms).filter(r=>r.aiman);
    let name="AIタイマン"+("000"+(trooms.length+1)).slice(-3);
    var room=new AimanRoom(name,rooms);
    rooms[room.id]=room;
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
const AIs=[
    [[-0.05640942529909543,0.20860565880389892,0,-0.8909014011697909,0,-0.7438341943372209,-0.1616810540024165,-0.10672178241336838,0.30273797868429714,0,0,-0.27067296050386647,0.16866652697566886,0.7014823220817739,0,0.184741525421374,1.2332991585696582,-0.35401111300289667,0,1.302828140852978,0,0.27240511407594914,0],[-0.7030865258454231,-0.34623533218944713,0.13140486659405748,0,-0.06980329023527121,0.36326876745729075,0,-0.29809297758613335,0,-0.6974711825862099,0,0.20422787848992408,0,-0.3327411055013576,-0.29806586516593625,0,0,0,0,-0.7228770694374373,-0.879324536376078,-0.001028355087315802,-0.41704682312574115],[0.554564972076398,0.5829846897350541,-0.48770705144718485,-0.18421593378957746,-0.5007711700979987,0.23001304157909896,0.6033390574435555,0.9355700001983185,0,-0.9430109004673604,0,0.8836660550359177,0.1818513192646496,-0.2745377653558956,-0.8765604850666882,0,0,0.7680237002682309,-0.20775575352065362,0.3766893382951009,-0.7017017703623745,-0.10250516451968461,0.1661495527435528],[0.6174555820064043,-0.2766816887096551,0.4508506163712882,0,-0.5141484874065139,0,0.23081861820469834,0,0,-0.43592093793337283,0.6104655771581402,0.882025767438892,0.007610646759460105,0,-0.5305148690502002,0.7258108140747279,-0.30663442784155315,-0.35634892045555944,0,-0.5301506846580726,-0.805953010033488,0.41326063873472185,0.10935063114319726],[-0.42693815109702316,0.3513343517864904,1.907487207724889,0,0.7733137556284462,-0.15851652557313778,0.340709976846576,0,0.23497128635293857,0.18524900558103208,0.8345729493737633,0.01693342287367805,0.12405484210016776,0,0,-0.07890884309390267,-0.40296102548299473,0,-0.6080489252392155,0,0,0,0]],
    [[0,-0.39024376490615786,-0.047417936168025365,-0.6863556167626261,-0.002635770905024204,-0.5093601064856673,0.31476342600264884,0.785538830731954,0.8393844096231865,-1.145478073072645,-0.630025526857418,-0.1369000608079049,1.2702726175879342,-0.14926033321930976,0,0.27913163408441743,0.5176045746377933,0.5062894850925217,0.1889523733427625,-0.05002311344279231,0.2156459426692352,0.4065800043697707,0.9553633325410937],[0,-1.0597670174904432,-0.6459845666106041,0,0.39490221855487184,0.15089047052097904,0.7863564902909534,-0.7570882586159018,0.23175140100053992,0.8784804492140925,-0.5832780256618268,-0.07411108373127995,0.11648789612291177,-1.2353234378588684,-0.1118229366504464,-0.27388806351971656,0,-0.254500383989126,0.09375389567134595,0.5894693495266927,0.6120357501079337,0.7818147877854369,-0.006337634958287819],[0,0.702247954160215,-0.5648885248743878,0.2746390827321057,-0.052589752636393206,-0.3225202006603876,0.9108823992214521,0.21777125319644686,-0.2307084230226667,0.1654422236176014,0.8725123245992512,0,0.9510949979085266,0.412687120243008,-1.19063115910674,1.333731140313799,-0.4330855839365407,0,-0.36096436522303826,-0.9935075705063123,0,0.07923844962931592,0.5719621827771393],[0.019506513669839576,0,0.37626154568923065,0,-0.2725623867106111,0.9968272712924049,0.39525970066877025,0,0,0.05186840536689474,0.6980711701159913,1.775409830440969,-0.4733334084743471,-0.2913357446359004,0,-0.09242220528418876,-0.9341721750302784,0.9482667683636008,0,-0.04638714543413408,0.8671233533953326,1.1407384513227645,0.0156960440976619],[1.6936958706442242,1.4096350697142122,-0.08567315668373121,0.9172841945770536,0,2.259538718169252,0.098449335013435,0.6856867238743489,-0.6232007173111589,0.870775890670314,-0.29612697682424605,0.7220423661861872,-0.9283629591260274,0.42676516064042447,-0.8528686986890646,0.21617271113101522,-0.7798520661617425,0,-0.38524456188301354,1.833260107032172,0,-0.5626741467751262,0.5985326592006146]],
]
class AimanRoom extends Room{
    constructor(name,parent){
        super(name,parent,{teamMode:false,maxPlayers:2,hidden:true,aiman:true});
        this.game.joinPlayer(new _game.TaimanAi("名無しAI🤖",this.game,AIs[Math.floor(Math.random()*AIs.length)]));
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
    this.reqDecision=function(callBack,candidates){
        this.socket.emit('input_action',{"candidates":candidates});
        this.onAction=function(data){
            callBack(this.game.genDecision(data.action));
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
