const app=require('express')();
const http=require('http').createServer(app);
const socketIO=require('socket.io');
const room=require('socket.io')
const io=socketIO.listen(http);
var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(40);
let playercount=0;
let waiting=[];
app.get('/',function(req,res){
    res.sendFile(__dirname+'/docs/index.html');
});
io.on('connection',function(socket){
    playercount++;
    socket.on('chat',function(data){
        data.time=new Date();
        console.log(data);
        io.emit('message',data);
    });
    let id="guest"+Math.floor(Math.random()*10000);
    socket.emit("joined",{"id":id});
    console.log("connected:"+id);

    waiting.push(new Human(id,socket));
    if(turns==0 && waiting.length+players.length>=2)init();

    socket.on('disconnect',(data)=>{
        players.filter(p=>p.hasOwnProperty("socket")).filter(p=>p.socket==socket).forEach(function(player){
            player.hp=0;
            player.input=function(cb){
                cb(new decision([_SKILLS.non]));
            }.bind(player);
            if(todo.length>1 && todo[1].hasOwnProperty("turn")){
                newresult[player.name]=new decision([_SKILLS.non]);
                if(Object.keys(newresult).length==Object.keys(todo[0]).length){
                    todo.shift();
                    result=Object.assign(newresult);
                    newresult={};
                    tick();
                }
            }
            player.clearCommand();
            console.log("disconnected:"+player.name);
        });
    });
});
http.listen(80);
console.log('It works!!');


function Human(name,socket){
    Player.call(this,name);
    this.socket=socket;
    this.sleepcount=0;
    this.input=function(callBack){
        let timeout=setTimeout(function(callBack){
            this.clearCommand();callBack(new decision([_SKILLS.non]));this.sleepcount++;if(this.sleepcount>=2)this.hp=0;
        }.bind(this,callBack),15000);
        commandInput(this,[],[{message:"行動入力",type:"action"}],undefined,callBack,timeout);
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
    io.emit('message',{"name":"★system","message":str});
}


const _HP=6;
const _ATTACK_DEFAULT=(user,players,decisions,args)=>players.map(p=>0);
const _DEFENSE_DEFAULT=(user,players,decisions,damages,args)=>damages.forEach(d=>user.hp-=d);
const _SKILLS={
    //id:技id mes:技名
    //atk:(技主,対象,対象の使用技)=>対象への攻撃力(防御前)
    //dmg:(技主,対象,対象の使用技,対象の攻撃力)=>対象からのダメージ(防御後)
    //act:技主=>使用時エフェクト
    //forone:対象は一人か (falseなら自分用の技か全体攻撃)
    //pow:威力(攻撃技専用)
    non:{id:0,mes:"スカ",args:[],
        attackPhase :_ATTACK_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT
    },

    def:{id:1,mes:"防御",args:[], 
            attackPhase:_ATTACK_DEFAULT,
            defensePhase:function(user,players,decisions,damages,args){
                damages.forEach(d=>user.hp-=Math.max(0,d-1));
            },
            dmg:(p,o,od,at)=>Math.max(at-1,0)
        },

    atk:{id:2,mes:"攻撃",args:[{message:"対象入力",type:"opponent"}],
            attackPhase:function(user,players,decisions,args){
                let damages=players.map(p=>0);
                damages[players.findIndex(p=>p.name==args[0])] = _SKILLS.atk.pow;
                return damages;
            },pow:1,
            defensePhase:_DEFENSE_DEFAULT
        },

    chr:{id:3,mes:"溜め",args:[],
            attackPhase:function(user,players,decisions,args){
                let damages=players.map(p=>0);
                user.charge++;
                return damages;
            },
            defensePhase:_DEFENSE_DEFAULT
        },

    wav:{id:4,mes:"光線",args:[{message:"対象入力",type:"opponent"}],
            attackPhase:function(user,players,decisions,args){
                let damages=players.map(p=>0);
                if(user.charge>0){
                    user.charge--;
                    let target=players.findIndex(p=>p.name==args[0]);
                    damages[target] = _SKILLS.wav.pow;
                }
                return damages;
            },
            beam:true,
            requirement:(p)=>(p.charge>0),pow:3,
            defensePhase:_DEFENSE_DEFAULT
        },
    
    mir:{id:5,mes:"反射",args:[],
            attackPhase:function(user,players,decisions,args){
                return decisions.map(d=>
                    d.skill.hasOwnProperty("beam")?d.skill.pow:0);
            },
            defensePhase:function(user,players,decisions,damages,args){
                damages.map((d,i)=>
                    decisions[i].skill.hasOwnProperty("beam")?0:d);
            },
        }
    //sui:{id:7,mes:"自殺"                                                                ,act:p=>(p.hp=0)}
};

players=[];
function reset(){
    turns=0;
    players=[];
    playercount=0;
    waiting=[];
    io.emit("reconnect");
}

let todoMoto=[
    {start:function(cb){
        logLine("★第"+turns+"ターン★");
        players=players.concat(waiting);
        waiting=[];
        todo[1]={};
        players.forEach(v=>todo[1][v.name]=v.input);
        cb(null);
    }},
    {},
    {turn:function(cb){return cb(turn(players,players.map(p=>result[p.name])))}},
    {nextTurn:
        function(cb){
            if(result.turn){
                todo=todo.concat(todoMoto);
                players=players.filter(v=>v.hp>0);
                turns++;
                setTimeout(cb,100);
            }
        }
    }
];
let turns=0;
let todo=todoMoto.map(v=>Object.assign(v));
let result={};
let newresult={};
function init(){
    turns=1;
    todo=todoMoto.map(v=>Object.assign(v));
    result={};
    newresult={};
    tick();
}
function tick(){
    1+1;
    for(id in todo[0]){
        todo[0][id](function(id,jobs,input){
            newresult[id]=input;
            if(Object.keys(newresult).length==jobs){
                todo.shift();
                result=Object.assign(newresult);
                newresult={};
                tick();
            }
        }.bind(null,id,Object.keys(todo[0]).length));
    }
}

function commandInput(from,args,argsleft,backToPrev,callBack,timeout){
    switch (argsleft[0].type) {
        case "action":
            var options=Object.keys(_SKILLS).filter(command=>
                !_SKILLS[command].hasOwnProperty("requirement")
                ||_SKILLS[command].requirement(from)
            );
            var optionnames=options.map(s=>_SKILLS[s].mes);
            var optionargs=(n)=>_SKILLS[n].args;
            var optionconv=(n)=>_SKILLS[n];
            break;
        case "opponent":
            var options=players.filter(p=>p!==from).map(p=>p.name);
            var optionnames=options;
            break;
    
        default:
            break;
    }
    let backToThis=function (from,args,argsleft,backToPrev,callBack,timeout){
        commandInput(from,args,argsleft,backToPrev,callBack,timeout)
    }.bind(null,from,args,argsleft,backToPrev,callBack,timeout);
    let onCommand=function (from,callBack,args,argsleft,optionargs,backToThis,backToPrev,optionconv,timeout,input){
        from.clearCommand();
        if(input=="!cancel") backToPrev();
        var newargs=[];
        if(optionargs!=undefined)var newargs=optionargs(input);
        if(optionconv!=undefined)input=optionconv(input);
        if(argsleft.length+newargs.length<=1){
            callBack(decision(args.concat(input)));
            clearTimeout(timeout);
            from.sleepcount=0;
        }else{
            commandInput(from,args.concat(input),argsleft.concat(newargs).slice(1),backToThis,callBack,timeout);
        }
    }.bind(null,from,callBack,args,argsleft,optionargs,backToThis,backToPrev,optionconv,timeout);
    
    if(args.length==0){
        from.reqCommand(onCommand,argsleft[0].message,options.map((c,i)=>{return {"name":optionnames[i],"command":c}}));
    }else{
        from.reqCommand(onCommand,argsleft[0].message,
            [{"name":"キャンセル","command":"!cancel"}].concat(options.map((c,i)=>{return {"name":optionnames[i],"command":c}})));
    }

    
}
function logLine(str){
    log(str+"\n");
}


function decision(args){
    return {skill:args[0],args:args.slice(1)};
}
function Player(name){
    this.hp=_HP;
    this.name=name;
    this.charge=0;
    this.decision=function(o){return new decision([_SKILLS.non])}.bind(this);
    this.input=function(cb){
        cb(this.decision(players.filter(v=>v!==this)))
    }.bind(this);

    this.state=function(){
        return this.name+"(hp:"+this.hp+",charge:"+this.charge+")";
    }
}
function array_shuffle(arr){
    let newarr=[];
    arr.forEach(v=>newarr.splice(Math.floor((newarr.length+1)*Math.random()),0,v));
    return newarr;
}

function turn(players,decisions){
    logLine("~~~~~");
    //条件処理
    for(let from=0;from<decisions.length;from++){
        if( decisions[from].skill.hasOwnProperty("reqirement") &&
            decisions[from].skill.requirement(players[from])){
                decisions[from].skill=_SKILLS.non;
            }
    }

    let damages=players.map(p=>[]);
    //攻撃処理
    for(let from=0;from<decisions.length;from++){
        decisions[from].skill.attackPhase(players[from],players,decisions,decisions[from].args).forEach((damage,i) => {
            damages[i].push(damage);
        });
    }
    //防御処理
    for(let from=0;from<decisions.length;from++){
        decisions[from].skill.defensePhase(players[from],players,decisions,damages[from],decisions[from].args);
    }

    //技表示
    for(let i=0;i<decisions.length;i++){
        if(decisions[i].args.hasOwnProperty("to")){
            logLine(players[i].name+" : "+decisions[i].skill.mes+"⇢"+decisions[i].args.to);
        }else{
            logLine(players[i].name+" : "+decisions[i].skill.mes);
        }
    }
    logLine("~~~~~");
    //hp表示
    let livingCount=players.filter(v=>v.hp>0).length;
    for(let i=0;i<decisions.length;i++){
        if(players[i].hp<=0){
            logLine(players[i].name+"死亡("+(livingCount+1)+"位)...");
        }else{
            logLine(players[i].name+"  "+"♥".repeat(players[i].hp)+"   "+"☯".repeat(players[i].charge));
        }
    }
    logLine("~~~~~");
    if(livingCount>1){
        return true;
    }else{
        logLine("試合終了");
        if(livingCount>0)logLine("勝者..."+players.filter(v=>v.hp>0)[0].name);
        else logLine("勝者...なし");
        logLine("10秒後にリスタート");
        setTimeout(()=>reset(),10000);
        return false;
    }
}
