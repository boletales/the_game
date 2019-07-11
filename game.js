if(typeof process == 'undefined'){
    var exports={};
}

_ATTACK_DEFAULT=(user,players,decisions,args)=>players.map(p=>0);
_MIDDLE_DEFAULT=(user,players,decisions,attacksAll,args)=>{};
_DEFENSE_DEFAULT=(user,players,decisions,attacksForMe,args)=>attacksForMe;
exports._ATTACK_DEFAULT=_ATTACK_DEFAULT;
exports._DEFENSE_DEFAULT=_DEFENSE_DEFAULT;
_SKILLS_MOTO={
    //id:技id name:技名
    //atk:(技主,対象,対象の使用技)=>対象への攻撃力(防御前)
    //dmg:(技主,対象,対象の使用技,対象の攻撃力)=>対象からのダメージ(防御後)
    //act:技主=>使用時エフェクト
    //forone:対象は一人か (falseなら自分用の技か全体攻撃)
    //pow:威力(攻撃技専用)
    non:{name:"スカ",args:[],
        attackPhase :_ATTACK_DEFAULT,
        middlePhase:_MIDDLE_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT
    },

    def:{name:"防御",args:[], 
            attackPhase:_ATTACK_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:function(user,players,decisions,attacksForMe,args){
                return attacksForMe.map(d=>{
                    if(d>0){
                        user.charge+=1;
                        return d-1;
                    }else{
                        return 0;
                    }
                });
            },
        },

    atk:{name:"攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                attacks[players.findIndex(p=>p.id==args[0])] = _SKILLS_MOTO.atk.pow;
                return attacks;
            },pow:1,
            weak:true,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },

    chr:{name:"溜め",args:[],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                user.charge+=3;
                return attacks;
            },
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },

    wav:{name:"光線",args:[{message:"対象入力",type:"opponent",name:"to"}],
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
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:function(user,players,decisions,attacksForMe,args){
                return attacksForMe.map((d,i)=>{
                    if(decisions[i].weak){
                        return 0;
                    }else{
                        return d;
                    }
                });
            },
        },
    
    mir:{name:"反射",args:[],
            attackPhase:_ATTACK_DEFAULT,
            middlePhase:function(user,players,decisions,attacksAll,args){
                let myId=players.indexOf(user);
                decisions.forEach((d,i)=>{
                    if(d.skill.hasOwnProperty("beam")){
                        attacksAll[i][myId]=attacksAll[myId][i];
                        attacksAll[myId][i]=0;
                    }
                })
            },
            defensePhase:_DEFENSE_DEFAULT,
            reflect:true,
        }
    //sui:{id:7,name:"自殺"                                                                ,act:p=>(p.hp=0)}
};

_SKILLS_MOD_HEAL={

    hea:{name:"回復",args:[], 
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                if(this.requirement(user)){
                    user.charge-=3;
                    user.hp += 1;
                }
                return attacks;
            },
            beam:true,
            requirement:(p)=>(p.charge>=3),pow:3,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT,
        },
};

_SKILLS_MOD_ATPLUS={
    atk:{name:"攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                attacks[players.findIndex(p=>p.id==args[0])] = _SKILLS_MOTO.atk.pow+user.buffs.str.getPower();
                return attacks;
            },pow:1,
            weak:true,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },

    str:{name:"強化",args:[],
            attackPhase:function(user,players,decisions,args){
                user.buffs.str.levelUp();
                let attacks=players.map(p=>0);
                return attacks;
            },
            requirement:(p)=>(p.charge>=p.buffs.str.getCost()),
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },
};
_SKILLS_MOD_STUN={
    stu:{name:"麻痺",args:[{message:"対象入力",type:"opponent",name:"to"}], 
            attackPhase:function(user,players,decisions,args){
                let target=players.findIndex(p=>p.id==args[0]);
                if(decisions[target].skill.reflect){
                	user.buffs.stu.level++;
                }else{
                	players[target].buffs.stu.level++;
                }
                let attacks=players.map(p=>0);
                return attacks;
            },
            requirement:(p)=>(p.charge>=p.buffs.stu.getCost()),
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },
}
const Buffs={
    str:function(user){
        this.tick=function(){};
        this.level=0;
        this.user=user;
        this.id="str";
        this.getPower=function(){
            return this.level;
        }.bind(this);
        this.levelUp=function(){
            if(this.user.charge>=this.getCost(this.level)){
                this.user.charge-=this.getCost(this.level);
                this.level++;
            }
        }.bind(this);
        this.getCost=function(){
            return this.level<2?(this.level+1)*3:Infinity;
        }.bind(this);
        this.state=function(){
            return "⚔".repeat(this.level);
        }.bind(this);
    },
    stu:function(user){
        this.tick=function(){
        	if(this.level>0)this.level--;
        };
        this.level=0;
        this.user=user;
        this.id="stu";
        this.state=function(){
            return "".repeat(this.level);
        }.bind(this);
    },
}
function mergeSkills(arraySkills){
    let skills={};
    arraySkills.forEach(_s=>{
        Object.keys(_s).forEach(key=>skills[key]=Object.assign(_s[key]));
    });
    return skills;
}

function Rule(skills,hp){
    this.skills=skills;
    this.hp=hp;
}
let _RULE_OLD=new Rule(_SKILLS_MOTO,6);
let _RULE_NEW=new Rule(mergeSkills([_SKILLS_MOTO,_SKILLS_MOD_HEAL,_SKILLS_MOD_ATPLUS,_SKILLS_MOD_STUN]),7);
exports._RULE_OLD=_RULE_OLD;
exports._RULE_NEW=_RULE_NEW;

exports._SKILLS_MOTO=_SKILLS_MOTO;
exports._HP_DEFAULT=6;
class Game{
    constructor(rule,args,closeGame,okawari,log,showPlayers=function(){},noticewinner=function(){},needokawari=true){
        this.log=log;
        this.noticewinner= noticewinner;
        this.needokawari = needokawari;
        this._HP         = rule.hp;
        this._SKILLS     = rule.skills;
        this.teamMode    = args.hasOwnProperty("teamMode")   ?args.teamMode   :true;
        this.maxPlayers  = args.hasOwnProperty("maxPlayers") ?args.maxPlayers :Infinity;
        this.startnumber = args.hasOwnProperty("startnumber")?args.startnumber:2;
        this.maxTurns    = args.hasOwnProperty("maxTurns")   ?args.maxTurns   :Infinity;
        Object.values(this._SKILLS).forEach((s,i)=>s.id=i);
        this.players=[];
        this.waiting=[];
        this.turns=0;
        this.closeGame=closeGame;
        this.okawari=okawari;
        this.showPlayers=(()=>showPlayers(this.players)).bind(this);
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
        this.todo=this.todoMoto.map(v=>Object.assign(v));
        this.result={};
        this.newresult={};
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
        players.forEach(p=>p.refreshBuffs());
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
        
        //中間処理
        for(let from=0;from<decisions.length;from++){
            decisions[from].skill.middlePhase(players[from],players,decisions,attacks,decisions[from].args);
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
    Object.keys(Buffs).forEach((key=>this.buffs[key]=new Buffs[key](this)).bind(this));
    this.decision=function(player,supporter,opponents,candidates){return new _game.decision([game._SKILLS.non])}.bind(this);
    this.reqDecision=function(callBack,candidates){
        if(this.buffs.stu.level>0){
        	callBack(new _game.decision([game._SKILLS.non]));
        }else{
            this.reqDecisionWrapped(callBack,candidates);
        }
    }
    this.reqDecisionWrapped=function(callBack,candidates){
        callBack(this.decision(
            this,
            this.game.players.filter(v=>v.team==this.team&&v!==this),
            this.game.players.filter(v=>v.team!=this.team),

        ));
    }.bind(this);

    this.state=function(){
        return "♥".repeat(Math.max(this.hp,0))+"   "+"☯".repeat(Math.max(this.charge,0))+"   "+Object.values(this.buffs).map(b=>b.state()).join(" ");
    }

    this.refreshBuffs=function(){
        this.buffs.forEach(b=>b.tick());
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
function TaimanAi(id,game,param){
    Player.call(this,id,id,id,game);
    this.param=param;
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
        let probs=MxV(this.param,data).map(v=>Math.max(v,0));
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
