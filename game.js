if(typeof process == 'undefined'){
    var exports={};
}

_ATTACK_DEFAULT=(user,players,decisions,args)=>players.map(p=>0);
_DEFENSE_DEFAULT=(user,players,decisions,attacks,args)=>attacks;
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
            defensePhase:function(user,players,decisions,attacks,args){
                return attacks.map(d=>{
                    if(d>0){
                        user.charge+=1;
                        return d-1;
                    }else{
                        return 0;
                    }
                });
            },
        },

    atk:{id:2,name:"攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                attacks[players.findIndex(p=>p.id==args[0])] = _SKILLS_MOTO.atk.pow;
                return attacks;
            },pow:1,
            defensePhase:_DEFENSE_DEFAULT
        },

    chr:{id:3,name:"溜め",args:[],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                user.charge+=3;
                return attacks;
            },
            defensePhase:_DEFENSE_DEFAULT
        },

    wav:{id:4,name:"光線",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                if(this.requirement(user)){
                    user.charge-=3;
                    let target=players.findIndex(p=>p.id==args[0]);
                    attacks[target] = _SKILLS_MOTO.wav.pow;
                }
                return attacks;
            },
            beam:true,
            requirement:(p)=>(p.charge>=3),pow:3,
            defensePhase:function(user,players,decisions,attacks,args){
                return attacks.map(d=>{
                    if(d>1){
                        return d;
                    }else{
                        return 0;
                    }
                });
            },
        },
    
    mir:{id:5,name:"反射",args:[],
            attackPhase:function(user,players,decisions,args){
                return decisions.map(d=>
                    d.skill.hasOwnProperty("beam")?d.skill.pow:0);
            },
            defensePhase:function(user,players,decisions,attacks,args){
                return _DEFENSE_DEFAULT(user,players,decisions,attacks.map((d,i)=>
                (decisions[i].skill.hasOwnProperty("beam") && decisions[i].args[0]==user.id)?0:d),args);
            },
        }
    //sui:{id:7,name:"自殺"                                                                ,act:p=>(p.hp=0)}
};
exports._SKILLS_MOTO=_SKILLS_MOTO;

exports._HP_DEFAULT=6;
class Game{
    constructor(skills,args,closeGame,okawari,log,showPlayers=function(){},noticewinner=function(){},needokawari=true){
        this.log=log;
        this.noticewinner= noticewinner;
        this.needokawari = needokawari;
        this.teamMode    = args.hasOwnProperty("teamMode")   ?args.teamMode   :true;
        this.maxPlayers  = args.hasOwnProperty("maxPlayers") ?args.maxPlayers :Infinity;
        this._HP         = args.hasOwnProperty("hp")         ?args.hp         :6;
        this.startnumber = args.hasOwnProperty("startnumber")?args.startnumber:2;
        this.maxTurns    = args.hasOwnProperty("maxTurns")   ?args.maxTurns   :Infinity;
        this.todoMoto=[
            //cb:callback
            {start:function(cb){
                this.log("★第"+this.turns+"ターン★");
                this.players=this.players.concat(this.waiting.filter(p=>!p.isHuman||p.socket.connected));
                this.waiting=[];
                this.todo[1]={};
                this.players.forEach(p=>{
                        if(p.isHuman){
                            this.todo[1][p.id]=
                                (cb=>{
                                    p.reqDecision(((input)=>{
                                            log("行動決定:"+p.nickname+"("+(Object.keys(this.newresult).length+1)+"/"+Object.keys(this.todo[0]).length+")");
                                            cb(input);
                                        }).bind(this)
                                    ,this.genCommandcandidates(p));
                                }).bind(this)
                        }else{
                            this.todo[1][p.id]=
                                (cb=>{
                                    p.reqDecision(((input)=>{
                                            log("行動決定:"+p.nickname+"("+(Object.keys(this.newresult).length+1)+"/"+Object.keys(this.todo[0]).length+")");
                                            cb(input);
                                        }).bind(this)
                                    );
                                }).bind(this)
                        }
                    }
                );
                this.showPlayers();
                cb(null);
            }.bind(this)},
            {/*入力待ち*/},
            {turn:function(cb){return cb(this.turn(this.players,this.players.map(p=>this.result[p.id])))}.bind(this)},
            {nextTurn:
                function(cb){
                    if(this.result.turn){
                        this.todo=this.todo.concat(this.todoMoto);
                        this.players=this.players.filter(v=>v.hp>0);
                        this.turns++;
                        setTimeout(cb,0);
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
    tick(){
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
    reset(){
        this.turns=0;
        this.players=[];
        this.waiting=[];
        this.closeGame();
    }
    init(){
        this.turns=1;
        this.todo=this.todoMoto.map(v=>Object.assign(v));
        this.result={};
        this.newresult={};
        this.tick();
    }


    genCommandcandidates(player){
        let expansion=function(args){
            if(args.length>0){
                var arg=args[0];
            }else{
                return undefined;
            }
            let ret={"message":arg.message,"type":arg.type,"candidates":undefined};
            switch (arg.type) {
                //行動（使用可能なスキル,スキルの引数）
                case "action":
                    ret.candidates=
                        Object.keys(this._SKILLS).filter(command=>this.checkRec(player,this._SKILLS[command])).reduce(
                            function(a,skillname){
                                a[skillname]={"name":this._SKILLS[skillname].name,"args":expansion(this._SKILLS[skillname].args.concat(args.slice(1)))}
                                return a;
                            }.bind(this)
                        ,{});
                    break;

                //対象（敵）
                case "opponent":
                    ret.candidates=
                        this.players.filter(p=>p.team!==player.team).map(p=>p.id).reduce(
                            function(a,playerid){
                                a[playerid]={"name":this.players.find(p=>p.id==playerid).nickname,"args":expansion(args.slice(1))}
                                return a;
                            }.bind(this)
                        ,{});
                    break;
                default:
                    break;
            }
            return ret;
        }.bind(this);

        return expansion([{message:"行動入力",type:"action"}]);
    }
    

    turn(players,decisions){
        players.forEach(p=>p.noticeDecisions(players.map((pl,i)=>{return {"id":pl.id,"decision":decisions[i].skill.id};})));
        this.log("~~~~~");
        //条件処理
        for(let from=0;from<decisions.length;from++){
            if(!this.checkRec(players[from],decisions[from].skill)){
                decisions[from].skill=this._SKILLS.non;
            }
        }

        let attacks=players.map(p=>[]);
        //攻撃処理
        for(let from=0;from<decisions.length;from++){
            decisions[from].skill.attackPhase(players[from],players,decisions,decisions[from].args).forEach((damage,i) => {
                attacks[i].push(damage);
            });
        }

        //防御処理
        let damages=[];
        for(let to=0;to<decisions.length;to++){
            damages.push(decisions[to].skill.defensePhase(players[to],players,decisions,attacks[to],decisions[to].args));
        }

        //ダメージを与える
        players.forEach((p,i)=>p.hp-=damages[i].reduce((a,c)=>a+c,0));


        //結果表示
        this.log("~~~~~");
        let livingTeams=[];
        players.filter(v=>v.hp>0).forEach(p=>livingTeams.indexOf(p.team)==-1&&livingTeams.push(p.team));

        for(let i=0;i<decisions.length;i++){
            let dstr=" "+damages[i].map((v,j)=>[v,"←「"+players[j].nickname+"」の≪"+decisions[j].skill.name+"≫("+v+"dmg.)"]).filter(d=>d[0]>0).map(d=>d[1]).join("  ");
            let oppindex=decisions[i].skill.args.findIndex(a=>a.name=="to");
            if(oppindex!=-1){
                this.log(players[i].nickname+":≪"+decisions[i].skill.name+"≫⇢「"+players.find(p=>p.id==decisions[i].args[oppindex]).nickname+"」");
            }else{
                this.log(players[i].nickname+":≪"+decisions[i].skill.name+"≫");
            }
            if(players[i].hp<=0){
                this.log("  死亡..."+dstr);
            }else{
                this.log("  "+players[i].state()+dstr);
            }
            this.log("");
        }
        this.showPlayers(players);
        this.log("~~~~~");
        if((livingTeams.length>1 || this.waiting.length>0) && this.turns<this.maxTurns){
            return true;
        }else{
            this.log("試合終了");
            if(livingTeams.length==1){
                if(this.teamMode){
                    this.log("勝者...🎉 チーム「"+livingTeams[0]+"」 🎉");
                    this.noticewinner(livingTeams[0]);
                }else{
                    this.log("勝者...🎉 "+players.filter(v=>v.hp>0)[0].nickname+" 🎉");
                    this.noticewinner(players.filter(v=>v.hp>0)[0].id);
                }
            }else{
                this.log("勝者...なし");
                this.noticewinner(null);
            }
            if(this.needokawari){
                this.log("10秒後に次の試合");
                setTimeout(this.okawari,10000);
            }
            return false;
        }
    }
    checkRec(player,skill){
        return !skill.hasOwnProperty("requirement")||skill.requirement(player);
    }
    killPlayer(id){
        this.players.filter(p=>p.id==id).forEach(player=>{
            player.hp=0;
            player.reqDecision=function(cb){
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
    countJoined(){
        return this.players.length+this.waiting.length;
    }
    genDecision(args){
        if(args==undefined || args.length==0){
            return {skill:this._SKILLS.non,args:[]};
        }else if(args.length==1){
            return {skill:this._SKILLS[args[0]],args:[]};
        }else{
            return {skill:this._SKILLS[args[0]],args:args.slice(1)};
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
    this.decision=function(player,supporter,opponents,candidates){return new _game.decision([game._SKILLS.non])}.bind(this);
    this.reqDecision=function(callBack,candidates){
        callBack(this.decision(
            this,
            this.game.players.filter(v=>v.team==this.team&&v!==this),
            this.game.players.filter(v=>v.team!=this.team),

        ));
    }.bind(this);

    this.state=function(){
        return "♥".repeat(Math.max(this.hp,0))+"   "+"☯".repeat(Math.max(this.charge,0));
    }

    this.refreshBuffs=function(){
        this.buffs=this.buffs.map(b=>b.tick()).filter(b=>b.effective);
        this.buffs=this.buffs.concat(this.newBuffs);
    }
    this.clearCommand=function(){};

    this.noticeDecisions=function(decisions){};
}

function array_shuffle(arr){
    let newarr=[];
    arr.forEach(v=>newarr.splice(Math.floor((newarr.length+1)*Math.random()),0,v));
    return newarr;
}
exports.Player=Player;



//param: [action][data]
let actions=Object.keys(_SKILLS_MOTO).length-1;
let datas= 5+Object.keys(_SKILLS_MOTO).length*3/*+Object.keys(_SKILLS_MOTO).length*/ ;
function TaimanAi(id,game,params){
    Player.call(this,id,id,id,game);
    this.params=params;
    this.decisionCounts      =[[0,0,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,0]];
    this.data=Array(Object.keys(_SKILLS_MOTO).length).fill(0);
    this.noticeDecisions=function(decisions){
        this.decisionCounts.unshift([0,0,0,0,0,0]);
        this.decisionCounts.pop();
        this.decisionCounts[decisions.find(d=>d.id!=this.id).decision]++;
    };
    this.decision=function(player,supporter,opponents,candidates){
        return this.game.genDecision(this.ai(opponents[0].id,
                    [   
                        1,
                        player.hp,
                        player.charge,
                        opponents[0].hp,
                        opponents[0].charge
                    ].concat(this.decisionCounts[0]).concat(this.decisionCounts[1]).concat(this.decisionCounts[2])));
    }.bind(this);
    this.ai=function(opponentid,data){
        let probs=MxV(this.param[Math.floor(Math.random()*this.params.length)],data).map(v=>Math.max(v,0));
        let sum=probs.reduce((p,c)=>p+c,0);
        if(sum==0){
            return ["atk",opponentid];
        }else{
            let rx=Math.random()*sum;
            let decid=1;//行動番号
            for(let i=0;i<probs.length;i++){
                rx-=probs[i];
                if(rx>0)decid++;
            }
            let decstr=Object.keys(this.game._SKILLS)[decid];
            if(this.game._SKILLS[decstr].args.length>0){
                return [decstr,opponentid];
            }else{
                return [decstr];
            }
        }
    }
}
function MxV(matrix,cvec){
    return matrix.map(rvec=>rvec.reduce((prev,current,i,rvec)=>prev+rvec[i]*cvec[i],0));
}
exports.TaimanAi=TaimanAi;