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
        joinRoom(data.roomid,socket,data.nickname,data.team);
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
        this.game=new _game.Game(_game._RULE_NEW,args,this.closeGame.bind(this),this.okawari.bind(this),this.log.bind(this),this.showPlayers.bind(this));
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
        let roomid=makeRoom(this.name,this.args);
        if(io.sockets.adapter.rooms[this.id]!=undefined){
            let humans=Object.keys(io.sockets.adapter.rooms[this.id].sockets);
            let aicount=this.game.players.filter(p=>p.isAI).length+this.game.deadPlayers.filter(p=>p.isAI).length;
            rooms[roomid].game.setStartnumber(Math.max(2,humans.length+aicount));
            humans.map(((roomid,socketid)=>{
                let socket=io.sockets.sockets[socketid];
                let player=this.game.players.find(p=>p.socket==socket);
                if(player){
                    socket.emit("okawari",{nickname:player.nickname,team:player.team,roomid:roomid});
                }else{
                    socket.emit("okawari",{roomid:roomid});
                } 
            }).bind(null,roomid));
            for(let i=0;i<aicount;i++){
                let id=Math.floor(Math.random()*AIs.length);
                rooms[roomid].game.joinPlayer(new _game.TaimanAi("名無しAI🤖"+id,this.game,AIs[id]));
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
const AIs=[
    [[-0.4427735095010146,0,0,0.044800435210804235,0,-0.5570245172831063,0.14080809641720038,-0.24520109007769952,0,0,0,0,0.9772500825694312,0,-0.7952470219253591,0,0,0.5698633502302499,0,0.8603742861257444,-0.059459584294852874,0.2399168330305319,0,0,0.918810961324362,0.03897529456614085,0.05171702785678933,-0.40408019411743545,0,0,0.5795713390837394,0,0,0.7805978226226431,0,-0.22041408434344256,0.4716629441136786],[0,-0.8182202092749418,0,0.6940042381767821,0.12226188181249165,-0.3939114416380205,0,0.37106486878603806,0,0.5559106024573057,0,0.6148829044666151,0,0.6709763473052832,0,0,0,-0.017569537000126978,0,-0.2811341220019088,0.9842090001095458,0.6856344358483979,-0.3203064333214176,0,-0.8614249877424793,0,0,0,0.4447580906994546,0,-0.06911283210851105,0,-0.7767215106582184,0,0,0.243475375459957,0.8203223800177826],[0,0.5697966396411676,0,0,0,0,0,0.8568675239412284,-0.9370630023556663,0,0.4210521984850919,-0.32815344160771776,0.8677727833236872,-0.047400523742268996,0,0,0,0.17687423915434852,0,-0.18105369003752747,0,0,-0.26656030501859274,0,0,0,0.144927941407353,0.9508396438715743,0,0,0,0,0.5464650437631631,0,0.2346558350208512,0,0],[0,0,-0.836240507013069,0.11125636503152259,0,0.23817303883065022,0,0,0,-0.016388911646196602,0,0,0.5635324640314794,0.06666976742946207,0.8452042741186161,0,0,0,-0.24641921412767398,0.7407595807257967,0,0,-0.14259999964790615,0.6391650012796466,0,0,0.1899784320250506,0.7979245252810923,0,-0.30151729177735853,-0.7698754385054785,0.4547275817317147,0,0,0,0,0],[0.1384534433409197,0,0.7406920755959727,-0.8369076747136781,0,0.2179116822458318,0.05463104484677128,-0.6581533856803381,0.8099811360776528,0.6816852566144984,0.9430220388316415,0,-0.43407509071647454,0,-0.17893029242218428,0.9201642024424068,0.05243953053546746,0,0.14555760993441047,0,0.6934356757762812,0,0,0,0.1973585534177298,-0.5321731009746531,0.061966531810571324,-0.15365397834457362,-0.3155601508263057,-0.3861096449315,0,0.8324439448041943,0,0,0.8688975849881062,0.5888651004764696,0.46152333298713355],[0,-0.3815008429822899,0,-0.17115524577577435,0,-0.9135188692577416,0,0,0,0,-0.5517230305065617,0,-0.6467023914350802,-0.7559462680000228,-0.9404184686217669,0,0.48323667468366227,0,-0.8637401263534836,1.0856632980806327,-0.5578026126401221,0.039583301233386825,-0.9017562470192422,-0.5941006252824472,0.7127778106521832,-0.7472643134949732,-0.044562928681328495,-0.7281177837735406,0,0.4228128846706942,0,0,0,0,0.7401848621323155,-0.4514393865740125,0],[0,0,0,0,0,0,-0.26944210374136235,0.19996740593874995,0.5436529774122256,0,0,0,0,0,0,0,0.715431196651314,0,0,0.15117099257250255,-0.9755241976681408,-0.043198916023053036,0,0,-0.2229395916337955,0.14674990041191083,0,0,0,-0.911835278190237,0,0.05473667299929441,0.9619864789458776,0.3749710361801737,0.22188409692800481,0,0],[-0.37139439890725034,0,0.8462587625994034,0,0,0,-0.8659209546260527,0,0,0.5105817245943021,0,0,-0.3637640730368432,-0.08911367093692935,0,-0.5225623064567415,-0.12411942802469333,-0.8013767128103291,0.5321344128789844,-0.2533676698296494,0,0,0,0,0,0.698349613803608,0,0.7924697987502758,0,0,0,0.7637201198034573,0.5051918827034942,0,-0.479927765151108,-0.3442702306281884,0.502510861310633],[0.08494149842124332,-0.06220242833125744,0,0.03572596928223659,0,-0.906230974852358,0,0,-0.4389336581616154,0,0,0,0.1939052772612686,0.4262631599670763,-0.4137366085464891,0.7157489059440201,0,0,0,0,0.9017239405270259,0,0,0.45779390647915474,0.4220657073798304,0.9874458748345714,0,0,0,0,0,0,0,-0.3999419604085166,0,-0.6168222327640598,0]],
    [[-0.4427735095010146,0,0,0.044800435210804235,0,-0.5570245172831063,0.14080809641720038,-0.24520109007769952,0,0,0,0,0.9772500825694312,0,-0.7952470219253591,0,0,0.5698633502302499,0,0.8603742861257444,-0.059459584294852874,0.2399168330305319,0,0,0.918810961324362,0.03897529456614085,0.05171702785678933,0.9661743327617947,0,0,0.5795713390837394,0,0,0.7805978226226431,0,0,0.4716629441136786],[0,-0.8182202092749418,0,0.6940042381767821,0.12226188181249165,-0.3939114416380205,0,0.37106486878603806,0,0.5559106024573057,0,0.6148829044666151,0,0.6709763473052832,0,0,0,-0.017569537000126978,0,-0.2811341220019088,0.9842090001095458,0.6856344358483979,-0.3203064333214176,0,0,0,0,0,0.4447580906994546,0,-0.06911283210851105,0,-0.7767215106582184,0,0,0.243475375459957,0.8203223800177826],[0,0.5697966396411676,0,0,0,0,0,0.8568675239412284,-0.9370630023556663,0,0.4210521984850919,0,0.8677727833236872,-0.047400523742268996,0,0,0,0.17687423915434852,0,-0.18105369003752747,0,0,-0.26656030501859274,0,0,0,0.144927941407353,0.9508396438715743,0,0,0,0,0.5464650437631631,0,0.2346558350208512,0,0],[0,0,-0.836240507013069,0.11125636503152259,0,0.23817303883065022,0,0,0,-0.016388911646196602,0,0,0.5635324640314794,0.06666976742946207,0.8452042741186161,0,0,0,-0.24641921412767398,0.7407595807257967,0,0,-0.14259999964790615,0.6391650012796466,0,0,0.1899784320250506,0.7979245252810923,0,-0.30151729177735853,-0.7698754385054785,0.4547275817317147,0,0,0,0,0],[0.1384534433409197,0,0.7406920755959727,-0.8369076747136781,0,0.2179116822458318,0.05463104484677128,-0.6581533856803381,0.8099811360776528,0.6816852566144984,0.9430220388316415,0,-0.43407509071647454,0,-0.17893029242218428,0.9201642024424068,0.05243953053546746,0,0.14555760993441047,0,0.6934356757762812,0,0,0,0.1973585534177298,-0.5321731009746531,0.061966531810571324,-0.15365397834457362,-0.3155601508263057,-0.3861096449315,0,0.8324439448041943,0,0,0.8688975849881062,0.5888651004764696,0.46152333298713355],[0,-0.3815008429822899,0,-0.990468113091989,0,-0.9135188692577416,0,0,0,0,-0.5517230305065617,0,-0.6467023914350802,-0.7559462680000228,-0.9404184686217669,0,0.48323667468366227,0,-0.8637401263534836,1.0856632980806327,-0.5578026126401221,0.039583301233386825,-0.9017562470192422,-0.5941006252824472,0.7127778106521832,-0.7472643134949732,-0.044562928681328495,-0.7281177837735406,0,0.4228128846706942,0,0,0,0,0.7401848621323155,-0.4514393865740125,0],[0,0,0,0,0,0,-0.26944210374136235,0.19996740593874995,0.5436529774122256,0,0,0,0,0,0,0,0.715431196651314,0,0,0.15117099257250255,-0.9755241976681408,-0.043198916023053036,0,0,-0.2229395916337955,0.14674990041191083,0,0,0,-0.911835278190237,0,0.05473667299929441,0.9619864789458776,0.3749710361801737,0.22188409692800481,0,0],[-0.37139439890725034,0,0.8462587625994034,-0.8768559435265189,0,0,-0.8659209546260527,0,0,0.5105817245943021,0,0,-0.3637640730368432,-0.08911367093692935,0,-0.5225623064567415,-0.12411942802469333,-0.8013767128103291,0.5321344128789844,-0.2533676698296494,0,0,0,0,0,0.698349613803608,0,0.7924697987502758,0,0,0,0.7637201198034573,0.5051918827034942,0,-0.479927765151108,-0.3442702306281884,0.502510861310633],[0.08494149842124332,-0.06220242833125744,0,0.03572596928223659,0,-0.906230974852358,0,0,-0.4389336581616154,0,0,0,0.1939052772612686,0.4262631599670763,-0.4137366085464891,0.7157489059440201,0,0,0,0,0.9017239405270259,0,0,0.45779390647915474,0,0.9874458748345714,0,0,0,0,0,0,0,-0.3999419604085166,0,-0.6168222327640598,0]],
]
class AimanRoom extends Room{
    constructor(name,parent){
        super(name,parent,{teamMode:false,maxPlayers:2,hidden:true,aiman:true});
        let id=Math.floor(Math.random()*AIs.length);
        this.game.joinPlayer(new _game.TaimanAi("名無しAI🤖"+id,this.game,AIs[id]));
        //this.game.joinPlayer(new _game.TaimanAi("名無しAI🤖",this.game,AIs));
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
    this.reqDecisionWrapped=function(callBack,candidates){
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
