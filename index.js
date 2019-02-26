const _game=require("./game.js");
const app=require('express')();
const http=require('http').createServer(app);
const socketIO=require('socket.io');
const room=require('socket.io')
const io=socketIO.listen(http);
const _TIMEOUT_SECONDS=240;
var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(40);

const _HP_DEFAULT=6;

let recentLog=[];
let recentLogMax=20;

let game=new _game.Game(_game._SKILLS_MOTO,_HP_DEFAULT,resetGame,log);
app.get('/',function(req,res){
    res.sendFile(__dirname+'/docs/index.html');
});
io.on('connection',function(socket){
    let id="guest"+Math.floor(Math.random()*10000);
    sendRecentLog(socket);
    socket.emit("joined",{"id":id});
    log("connected:"+id);
    game.joinPlayer(new Human(id,game,socket));

    socket.on('chat',function(data){
        chat(data);
        if(data.message.startsWith("!")) command(data.message.slice(1));
    });
    socket.on('disconnect',(data)=>{
        game.players.filter(p=>p.hasOwnProperty("socket")).filter(p=>p.socket==socket).map(p=>p.name).forEach(function(player){
            log("disconnected:"+player);
            game.killPlayer(player);
        });
    });
});
http.listen(process.env.PORT || 80);
console.log('It works!!');

function resetGame(){
    delete game;
    game=new _game.Game(_SKILLS_MOTO,_HP_DEFAULT,resetGame,log);
    Object.keys(io.sockets.connected).forEach(k=>{
        let s=io.sockets.connected[k];
        let id="guest"+Math.floor(Math.random()*10000);
        s.emit("reset",{"id":id});
        log("connected:"+id);
        game.joinPlayer(new Human(id,game,s),Infinity);
    });
    if(game.players.length>=2)game.init();
}

function Human(name,game,socket){
    _game.Player.call(this,name,game);
    this.socket=socket;
    this.sleepcount=0;
    this.input=function(callBack){
        let timeout=setTimeout(function(callBack){
            this.clearCommand();
            this.sleepcount++;
            if(this.sleepcount>=2){this.hp=0;}
            callBack(new _game.decision([this.game._SKILLS.non]));
        }.bind(this,callBack),_TIMEOUT_SECONDS*1000);
        this.game.commandInput(this,[],[{message:"行動入力",type:"action"}],undefined,callBack,timeout);
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

function log(str){
    chat({"name":"★system","message":str});
}
function chat(data){
    data.time=new Date();
    io.emit('message',data);
    process.stdout.write(data.name+"≫"+data.message+"\n");
    recentLog.push(data);
    if(recentLog.length>recentLogMax)recentLog.shift();
}
function sendRecentLog(socket){
    recentLog.forEach(data=>
            socket.emit("message",data)
        );
}

function command(_com){
    let com=_com.split(" ");
    switch (com[0]) {
        case "reset":
            resetGame();
            break;

        case "kick":
            if(game!=undefined && game.killPlayer!=undefined)(game.killPlayer(com[1]));
            break;

        case "startnumber":
            if(game!=undefined && game.setStartnumber!=undefined)(game.setStartnumber(parseInt(com[1])));
            break;
    
        default:
            break;
    }
}