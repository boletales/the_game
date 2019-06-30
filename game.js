_ATTACK_DEFAULT=(user,players,decisions,args)=>players.map(p=>0);
_DEFENSE_DEFAULT=(user,players,decisions,damages,args)=>damages.forEach(d=>user.hp-=d);
exports._ATTACK_DEFAULT=_ATTACK_DEFAULT;
exports._DEFENSE_DEFAULT=_DEFENSE_DEFAULT;
_SKILLS_MOTO={
    //id:技id name:技名
    //atk:(技主,対象,対象の使用技)=>対象への攻撃力(防御前)
    //dmg:(技主,対象,対象の使用技,対象の攻撃力)=>対象からのダメージ(防御後)
    //act:技主=>使用時エフェクト
    //forone:対象は一人か (falseなら自分用の技か全体攻撃)
    //pow:威力(攻撃技専用)
    non:{id:0,name:"スカ",args:[],
        attackPhase :_ATTACK_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT
    },

    def:{id:1,name:"防御",args:[], 
            attackPhase:_ATTACK_DEFAULT,
            defensePhase:function(user,players,decisions,damages,args){
                damages.forEach(d=>{
                    if(d>0){
                        user.hp-=d-1;
                        user.charge+=1;
                    }
                });
            },
        },

    atk:{id:2,name:"攻撃",args:[{message:"対象入力",type:"opponent"}],
            attackPhase:function(user,players,decisions,args){
                let damages=players.map(p=>0);
                damages[players.findIndex(p=>p.id==args[0])] = _SKILLS_MOTO.atk.pow;
                return damages;
            },pow:1,
            defensePhase:_DEFENSE_DEFAULT
        },

    chr:{id:3,name:"溜め",args:[],
            attackPhase:function(user,players,decisions,args){
                let damages=players.map(p=>0);
                user.charge+=3;
                return damages;
            },
            defensePhase:_DEFENSE_DEFAULT
        },

    wav:{id:4,name:"光線",args:[{message:"対象入力",type:"opponent"}],
            attackPhase:function(user,players,decisions,args){
                let damages=players.map(p=>0);
                if(this.requirement(user)){
                    user.charge-=3;
                    let target=players.findIndex(p=>p.id==args[0]);
                    damages[target] = _SKILLS_MOTO.wav.pow;
                }
                return damages;
            },
            beam:true,
            requirement:(p)=>(p.charge>=3),pow:3,
            defensePhase:_DEFENSE_DEFAULT
        },
    
    mir:{id:5,name:"反射",args:[],
            attackPhase:function(user,players,decisions,args){
                return decisions.map(d=>
                    d.skill.hasOwnProperty("beam")?d.skill.pow:0);
            },
            defensePhase:function(user,players,decisions,damages,args){
                _DEFENSE_DEFAULT(user,players,decisions,damages.map((d,i)=>
                decisions[i].skill.hasOwnProperty("beam")?0:d),args);
                ;
            },
        }
    //sui:{id:7,name:"自殺"                                                                ,act:p=>(p.hp=0)}
};
exports._SKILLS_MOTO=_SKILLS_MOTO;

exports._HP_DEFAULT=6;
class Game{
    constructor(skills,args,closeGame,okawari,log,showPlayers=function(){}){
        this.log=log;
        this.teamMode   = args.hasOwnProperty("teamMode")   ?args.teamMode   :true;
        this.maxPlayers = args.hasOwnProperty("maxPlayers") ?args.maxPlayers :Infinity;
        this.maxPlayers = args.hasOwnProperty("maxPlayers") ?args.maxPlayers :Infinity;
        this._HP        = args.hasOwnProperty("hp")         ?args.hp         :6;
        this.startnumber=2;
        this.todoMoto=[
            {start:function(cb){
                this.log("★第"+this.turns+"ターン★");
                this.players=this.players.concat(this.waiting);
                this.waiting=[];
                this.todo[1]={};
                this.players.forEach(p=>this.todo[1][p.id]=(cb=>{
                    p.input(((input)=>{
                        log("行動決定:"+p.nickname+"("+(Object.keys(this.newresult).length+1)+"/"+Object.keys(this.todo[0]).length+")");
                        cb(input);
                    }).bind(this));
                }).bind(this));
                this.showPlayers();
                cb(null);
            }.bind(this)},
            {},
            {turn:function(cb){return cb(this.turn(this.players,this.players.map(p=>this.result[p.id])))}.bind(this)},
            {nextTurn:
                function(cb){
                    if(this.result.turn){
                        this.todo=this.todo.concat(this.todoMoto);
                        this.players=this.players.filter(v=>v.hp>0);
                        this.turns++;
                        setTimeout(cb,100);
                    }
                }.bind(this)
            }
        ];
        this._SKILLS=skills;
        this.players=[];
        this.waiting=[];
        this.turns=0;
        this.todo=this.todoMoto.map(v=>Object.assign(v));
        this.result={};
        this.newresult={};
        this.closeGame=closeGame;
        this.okawari=okawari;
        this.showPlayers=(()=>showPlayers(this.players)).bind(this);
    }
    reset(){
        this.turns=0;
        this.players=[];
        this.waiting=[];
        this.playercount=0;
        this.closeGame();
    }
    init(){
        this.turns=1;
        this.todo=this.todoMoto.map(v=>Object.assign(v));
        this.result={};
        this.newresult={};
        this.tick();
    }
    tick(){
        1+1;
        for(let id in this.todo[0]){
            this.todo[0][id](function(id,jobs,input){
                this.newresult[id]=input;
                if(Object.keys(this.newresult).length==jobs){
                    this.todo.shift();
                    this.result=Object.assign(this.newresult);
                    this.newresult={};
                    this.tick();
                }
            }.bind(this,id,Object.keys(this.todo[0]).length));
        }
    }

    commandInput(from,args,argsleft,backToPrev,callBack,timeout){
        switch (argsleft[0].type) {
            case "action":
                var options=Object.keys(this._SKILLS).filter(command=>
                    !this._SKILLS[command].hasOwnProperty("requirement")
                    ||this._SKILLS[command].requirement(from)
                );
                var optionnames=options.map(s=>this._SKILLS[s].name);
                var optionargs=(n)=>this._SKILLS[n].args;
                var optionconv=(n)=>this._SKILLS[n];
                break;
            case "opponent":
                var options=this.players.filter(p=>p.team!==from.team).map(p=>p.id);
                var optionnames=this.players.filter(p=>p.team!==from.team).map(p=>p.nickname);
                break;
            default:
                break;
        }
        let backToThis=function (from,args,argsleft,backToPrev,callBack,timeout){
            this.commandInput(from,args,argsleft,backToPrev,callBack,timeout)
        }.bind(this,from,args,argsleft,backToPrev,callBack,timeout);
        let onCommand=function (from,callBack,args,argsleft,optionargs,backToThis,backToPrev,optionconv,timeout,input){
            from.clearCommand();
            if(input=="!cancel"){
                backToPrev();
                return;
            }

            var newargs=[];
            if(optionargs!=undefined)var newargs=optionargs(input);
            if(optionconv!=undefined)input=optionconv(input);
            if(argsleft.length+newargs.length<=1){
                callBack(decision(args.concat(input)));
                if(timeout!=undefined)clearTimeout(timeout);
                from.sleepcount=0;
            }else{
                this.commandInput(from,args.concat(input),argsleft.concat(newargs).slice(1),backToThis,callBack,timeout);
            }
        }.bind(this,from,callBack,args,argsleft,optionargs,backToThis,backToPrev,optionconv,timeout);
        
        if(args.length==0){
            from.reqCommand(onCommand,argsleft[0].message,options.map((c,i)=>{return {"name":optionnames[i],"command":c}}));
        }else{
            from.reqCommand(onCommand,argsleft[0].message,
                [{"name":"キャンセル","command":"!cancel"}].concat(options.map((c,i)=>{return {"name":optionnames[i],"command":c}})));
        }

        
    }

    turn(players,decisions){
        this.log("~~~~~");
        //条件処理
        for(let from=0;from<decisions.length;from++){
            if( decisions[from].skill.hasOwnProperty("reqirement") &&
                decisions[from].skill.requirement(players[from])){
                    decisions[from].skill=this._SKILLS.non;
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
        this.log("~~~~~");
        //hp表示
        let livingTeams=[];
        players.filter(v=>v.hp>0).forEach(p=>livingTeams.indexOf(p.team)==-1&&livingTeams.push(p.team));

        for(let i=0;i<decisions.length;i++){
            if(decisions[i].args.hasOwnProperty("to")){
                this.log(players[i].nickname+" : "+decisions[i].skill.name+"⇢"+decisions[i].args.to);
            }else{
                this.log(players[i].nickname+" : "+decisions[i].skill.name);
            }
            if(players[i].hp<=0){
                this.log("  死亡...");
            }else{
                this.log("  "+players[i].state());
            }
        }
        this.showPlayers(players);
        this.log("~~~~~");
        if(livingTeams.length>1){
            return true;
        }else{
            this.log("試合終了");
            if(livingTeams.length>0){
                if(this.teamMode){
                    this.log("勝者...🎉 チーム「"+livingTeams[0]+"」 🎉");
                }else{
                    this.log("勝者...🎉 "+players.filter(v=>v.hp>0)[0].nickname+" 🎉");
                }
            }else{
                this.log("勝者...なし");
            }
            this.log("10秒後に次の試合");
            setTimeout(this.okawari,10000);
            return false;
        }
    }
    killPlayer(name){
        this.players.filter(p=>p.nickname==name).forEach(player=>{
            player.hp=0;
            player.input=function(cb){
                cb(new decision([this._SKILLS.non]));
            }.bind(this);
            if(this.todo.length>1 && this.todo[1].hasOwnProperty("turn")){
                this.newresult[player.id]=new decision([this._SKILLS.non]);
                if(Object.keys(this.newresult).length==Object.keys(this.todo[0]).length){
                    this.todo.shift();
                    this.result=Object.assign(this.newresult);
                    this.newresult={};
                    this.tick();
                }
            }
            player.clearCommand();
        });
    }
    aki(){
        return this.players.length+this.waiting.length < this.maxPlayers;
    }
    joinPlayer(player,start=true){
        if(!this.aki()){
            return false;
        }
        if(this.turns==0){
            this.players.push(player);
            if(start && this.players.length>=this.startnumber){
                this.init();
            }
        }else{
            this.waiting.push(player);
        }
        return true;
    }
    setStartnumber(startnumber){
        this.startnumber=startnumber;
        if(this.players.length>=this.startnumber){
            this.init();
        }
    }
}
exports.Game=Game;
function decision(args){
    return {skill:args[0],args:args.slice(1)};
}
exports.decision=decision;
function Player(id,nickname,team,game){
    this.hp=game._HP;
    this.team=team;
    this.id=id;
    this.nickname=nickname;
    this.charge=0;
    this.game=game;
    this.buffs=[];
    this.newBuffs=[];
    this.decision=function(o){return new _game.decision([game._SKILLS.non])}.bind(this);
    this.input=function(cb){
        cb(this.decision(players.filter(v=>v!==this)))
    }.bind(this);

    this.state=function(){
        return "♥".repeat(Math.max(this.hp,0))+"   "+"☯".repeat(Math.max(this.charge,0));
    }

    this.refreshBuffs=function(){
        this.buffs=this.buffs.map(b=>b.tick()).filter(b=>b.effective);
        this.buffs=this.buffs.concat(this.newBuffs);
    }
}
function array_shuffle(arr){
    let newarr=[];
    arr.forEach(v=>newarr.splice(Math.floor((newarr.length+1)*Math.random()),0,v));
    return newarr;
}
exports.Player=Player;