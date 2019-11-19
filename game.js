if(typeof process == 'undefined'){
    var exports={};
}

_ATTACK_DEFAULT=(user,players,decisions,args)=>players.map(p=>0);
_MIDDLE_DEFAULT=(user,players,decisions,attacksAll,args)=>{};
_DEFENSE_DEFAULT=(user,players,decisions,attacksForMe,args)=>attacksForMe;
_REQUIREMENT_DEFAULT=(skill,p)=>(p.charge>=skill.getCost(p));
exports._ATTACK_DEFAULT=_ATTACK_DEFAULT;
exports._DEFENSE_DEFAULT=_DEFENSE_DEFAULT;

_SKILLS_ZERO={
    non:{name:"スカ",args:[],
        attackPhase :_ATTACK_DEFAULT,
        middlePhase:_MIDDLE_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(0),
        requirement:_REQUIREMENT_DEFAULT,
    },


    chr:{name:"溜め",args:[],
            attackPhase:function(user,players,decisions,args){
                user.charge+=1;
                return players.map(p=>0);
            },
            getCost:(p)=>(0),
            requirement:_REQUIREMENT_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },
    def:{name:"防御",args:[], 
            attackPhase:_ATTACK_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:function(user,players,decisions,attacksForMe,args){
                return attacksForMe.map((d,i)=>(decisions[i].skill.beam ? d : 0));
            },
            getCost:(p)=>(0),
            requirement:_REQUIREMENT_DEFAULT.bind(this),
            def:true,
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
            getCost:(p)=>(0),
            requirement:(p)=>(true),
            defensePhase:_DEFENSE_DEFAULT,
            reflect:true,
        },

    atk:{name:"攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                if(this.requirement(this,user)){
                    user.charge-=this.getCost(user);
                    let target=players.findIndex(p=>p.id==args[0]);
                    attacks[target] = this.pow;
                }
                return attacks;
            },
            pow:1,
            getCost:(p)=>(1),
            requirement:_REQUIREMENT_DEFAULT,
            weak:true,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:function(user,players,decisions,attacksForMe,args){
                return attacksForMe.map((d,i)=>(decisions[i].skill.beam?d:0));
            },
        },

    wav:{name:"強攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            if(this.requirement(this,user)){
                user.charge-=this.getCost(user);
                let target=players.findIndex(p=>p.id==args[0]);
                attacks[target] = this.pow;
            }
            return attacks;
        },
        beam:true,
        pow:1,
        middlePhase:_MIDDLE_DEFAULT,
        defensePhase:function(user,players,decisions,attacksForMe,args){
            return attacksForMe.map((d,i)=>0);
        },
        getCost:(p)=>(5),
        requirement:_REQUIREMENT_DEFAULT,
    },
};

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
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(0),
        requirement:_REQUIREMENT_DEFAULT,
    },

    def:{name:"防御",args:[], 
            attackPhase:_ATTACK_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:function(user,players,decisions,attacksForMe,args){
                return attacksForMe.map((d,i)=>{
                    if(d>0){
                        user.charge+=d;
                        return decisions[i].skill.beam ? d : Math.floor(d*0.5);
                    }else{
                        return 0;
                    }
                });
            },
            getCost:(p)=>(0),
            requirement:_REQUIREMENT_DEFAULT.bind(this),
            def:true,
        },

    atk:{name:"攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                attacks[players.findIndex(p=>p.id==args[0])] = this.pow+user.buffs.str.getPower();
                return attacks;
            },pow:1,
            getCost:(p)=>(0),
            requirement:_REQUIREMENT_DEFAULT,
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
            getCost:(p)=>(0),
            requirement:_REQUIREMENT_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
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
            getCost:(p)=>(0),
            requirement:(p)=>(true),
            defensePhase:_DEFENSE_DEFAULT,
            reflect:true,
        },

};
_SKILLS_MOD_BEAM={
    bea:{name:"光線",args:[{message:"対象入力",type:"opponent",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            if(this.requirement(this,user)){
                user.charge-=this.getCost(user);
                let target=players.findIndex(p=>p.id==args[0]);
                attacks[target] = this.pow;
            }
            return attacks;
        },
        beam:true,
        pow:3,
        middlePhase:_MIDDLE_DEFAULT,
        defensePhase:function(user,players,decisions,attacksForMe,args){
            return attacksForMe.map((d,i)=>{
                if(decisions[i].skill.weak){
                    return 0;
                }else{
                    return d;
                }
            });
        },
        getCost:(p)=>(3),
        requirement:_REQUIREMENT_DEFAULT,
    },
};
_SKILLS_MOD_HEAL={
    hea:{name:"回復",args:[{message:"対象入力",type:"supporter",name:"to"}], 
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                if(this.requirement(this,user)){
                    user.charge-=this.getCost(user);
                    players.find(p=>p.id==args[0]).hp += 3;
                }
                return attacks;
            },
            beam:true,
            getCost:(p)=>(6),
            requirement:_REQUIREMENT_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT,
        },
};
_SKILLS_MOD_HEALPLUS={
    the:{name:"全体回復",args:[], 
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                if(this.requirement(this,user)){
                    user.charge-=this.getCost(user);
                    players.find(p=>p.team==user.team).hp += 3;
                }
                return attacks;
            },
            beam:true,
            getCost:(p)=>(6),
            requirement:_REQUIREMENT_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT,
        },
    mhe:{name:"強回復",args:[{message:"対象入力",type:"supporter",name:"to"}], 
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                if(this.requirement(this,user)){
                    user.charge-=this.getCost(user);
                    players.find(p=>p.id==args[0]).hp += 6;
                }
                return attacks;
            },
            beam:true,
            getCost:(p)=>(6),
            requirement:_REQUIREMENT_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT,
        },
};
_SKILLS_MOD_ATPLUS={
    str:{name:"強化",args:[],
            attackPhase:function(user,players,decisions,args){
                user.buffs.str.levelUp();
                let attacks=players.map(p=>0);
                return attacks;
            },
            getCost:(p)=>p.buffs.str.getCost(),
            requirement:_REQUIREMENT_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },
};
_SKILLS_MOD_STUN={
    stu:{name:"麻痺",args:[{message:"対象入力",type:"opponent",name:"to"}], 
            attackPhase:function(user,players,decisions,args){
                if(this.requirement(this,user)){
                	user.charge-=this.getCost();
                    let target=players.findIndex(p=>p.id==args[0]);
                    if(decisions[target].skill.reflect){
                    	user.buffs.stu.level++;
                    }else{
                    	players[target].buffs.stu.level++;
                    }
                }
                let attacks=players.map(p=>0);
                return attacks;
            },
            getCost:(p)=>(3),
            requirement:_REQUIREMENT_DEFAULT,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },
};
_SKILLS_MOD_SMASH={
    sma:{name:"強奪",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                if(this.requirement(this,user)){
                    let targetIndex=players.findIndex(p=>p.id==args[0]);
                    attacks[targetIndex] = this.pow+user.buffs.str.getPower();
                    if(  !decisions[targetIndex].skill.def 
                       &&!decisions[targetIndex].skill.beam){
                        
                        let target=players.find(p=>p.id==args[0]);
                        target.buffs.chd.levelUp(2)
                        user.charge+=Math.min(target.charge,2);
                    }else{
                        user.charge-=this.getCost(user);
                    }
                }
                return attacks;
            },
            pow:1,
            getCost:(p)=>(2),
            requirement:_REQUIREMENT_DEFAULT,
            weak:true,
            middlePhase:function(user,players,decisions,attacksAll,args){
                let opp=players.find(p=>p.id==args[0]);
                opp.buffs.chd.tick();
            },
            defensePhase:_DEFENSE_DEFAULT
        },
};
_SKILLS_MOD_EXPLODE={
    exp:{name:"爆発",args:[],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                if(this.requirement(this,user)){
                    user.charge-=this.getCost(user);
                    let at=this.pow+user.buffs.str.getPower();
                    user.game.players.forEach((p,i)=>{
                        if(p.team!=user.team){
                            attacks[i]=at;
                        }
                    });
                }
                return attacks;
            },
            pow:1,
            getCost:((p)=>(_SKILLS_MOD_EXPLODE.exp.countOpponents(p)*(_SKILLS_MOD_EXPLODE.exp.pow+p.buffs.str.getPower()))),
            countOpponents:((user)=>user.game.players.filter(p=>p.team!=user.team).length),
            requirement:_REQUIREMENT_DEFAULT,
            weak:true,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },
};
_SKILLS_MOD_SALVO={
    sal:{name:"斉射",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                attacks[players.findIndex(p=>p.id==args[0])] = user.charge+user.buffs.str.getPower();
                user.charge=0;
                return attacks;
            },pow:1,
            getCost:(p)=>Math.max(p.charge,1),
            requirement:_REQUIREMENT_DEFAULT,
            weak:true,
            middlePhase:_MIDDLE_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT,
            pow:1,
        },
};

_SKILLS_MOD_EXAT={
    atk:{inherit:true,pow:5},
};


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
        this.state=function(){
            return "⚔".repeat(this.level);
        }.bind(this);
        
        this.getCost=(()=>{
            let costs=[4,7,10];
            return (this.user.buffs.str.level < costs.length) ? costs[this.user.buffs.str.level] : Infinity;
        }).bind(this);
    },
    stu:function(user){
        this.tick=function(){
        	if(this.level>0)this.level--;
        }.bind(this);
        this.level=0;
        this.user=user;
        this.id="stu";
        this.state=function(){
            return "⚡️".repeat(this.level);
        }.bind(this);
    },
    chd:function(user){
        this.tick=function(){
        	if(this.level>0){
			user.charge=Math.max(user.charge-this.level,0);
			this.level=0;
		}
        }.bind(this);
        this.level=0;
        this.user=user;
        this.id="chd";
        this.state=function(){
            return "";
        }.bind(this);
	this.levelUp=function(level){
            this.level+=level;
	}
    },
}
function mergeSkills(_skills,arraySkills){
    let skills=Object.assign({},_skills);
    arraySkills.forEach(_s=>{
        Object.keys(_s).forEach(key=>{
            let merging=Object.assign({},_s[key]);
            if(merging.inherit){
                skills[key]=Object.assign({},skills[key]);
                //部分的書き換えオプション
                if(skills.hasOwnProperty(key))Object.keys(merging).forEach(k=>skills[key][k]=merging[k]);
            }else{
                skills[key]=merging;
            }
        });
    });
    return skills;
}

function Kit(name,skills,hp,mark){
    this.skills=skills;
    this.hp=hp;
    this.name=name;
    this.mark=mark;
}
let _KIT_OLD=new Kit("初期版",_SKILLS_MOTO,6,"");
let _KIT_ZERO=new Kit("原作",_SKILLS_ZERO,1,"");
let _KIT_NEW=new Kit("スタンダード",mergeSkills({},[   
                            _SKILLS_MOTO,
                            _SKILLS_MOD_BEAM,
                            _SKILLS_MOD_HEAL,
                            _SKILLS_MOD_ATPLUS,
                            _SKILLS_MOD_SMASH,
                            _SKILLS_MOD_EXPLODE,
                            _SKILLS_MOD_SALVO,
                        ]),7,"(標)");
let _KIT_EXAT=new Kit("鬼畜攻撃力",mergeSkills(_KIT_NEW.skills,[   
                            _SKILLS_MOD_EXAT,
                        ]),7,"(攻)");
let _KIT_HEALER=new Kit("白魔導師",mergeSkills({},[   
                            _SKILLS_MOTO,
                            _SKILLS_MOD_HEALPLUS,
                        ]),7,"(白)");
let kitsets={
    "スタンダード":[_KIT_NEW],
    "ジョブあり":[_KIT_NEW,_KIT_HEALER],
    "原作":[_KIT_ZERO],
};

exports.kitsets=kitsets;
exports._KIT_OLD=_KIT_OLD;
exports._KIT_NEW=_KIT_NEW;
exports._KIT_EXAT=_KIT_EXAT;

exports._SKILLS_MOTO=_SKILLS_MOTO;
exports._HP_DEFAULT=6;

const OKAWARISEC=10;

class Game{
    constructor(kits,args,closeGame,okawari,log,showPlayers=function(){},noticewinner=function(){},needokawari=true){
        this.kits=kits;
        this.log=log;
        this.noticewinner= noticewinner;
        this.needokawari = needokawari;
        this.teamMode    = args.hasOwnProperty("teamMode")   ?args.teamMode   :true;
        this.maxPlayers  = args.hasOwnProperty("maxPlayers") ?args.maxPlayers :Infinity;
        this.startnumber = args.hasOwnProperty("startnumber")?args.startnumber:2;
        this.maxTurns    = args.hasOwnProperty("maxTurns")   ?args.maxTurns   :Infinity;
        kits.map(k=>Object.keys(k.skills)).flat()
            .reduce((a,c)=>a.includes(c)?a:a.concat(c),[])
            .forEach((n,i)=>kits.forEach(k=>{
                if(k.hasOwnProperty(n)){
                    let skcp=Object.assign({},k[n]);
                    skcp.id=i;
                    k[n]=skcp;
                }
            }));
        this.players=[];
        this.deadPlayers=[];
        this.waiting=[];
        this.turns=0;
        this.acceptingTurn=-1;
        this.closeGame=closeGame;
        this.okawari=okawari;
        this.showPlayers=(()=>showPlayers(this.players)).bind(this);
        this.todoMoto=[
            //cb:callback
            {start:function(cb){
                this.log("★第"+this.turns+"ターン★");
                this.waiting.filter(p=>!p.isHuman||p.socket.connected).forEach(p=>{
                    this.players.push(p);
                    this.log("「"+p.getShowingName()+"」参戦！！");
                });
                this.waiting=[];
                this.todo[1]={};
                this.acceptingTurn=this.turns;
                this.players.forEach(p=>{
                        if(p.isHuman){
                            this.todo[1][p.id]=
                                (cb=>{
                                    p.reqDecision(((input)=>{
                                            log("行動決定:"+p.getShowingName()+"("+(Object.keys(this.newresult).length+1)+"/"+Object.keys(this.todo[0]).length+")");
                                            cb(input);
                                        }).bind(this)
                                    ,this.genCommandcandidates(p));
                                }).bind(this)
                        }else{
                            this.todo[1][p.id]=
                                (cb=>{
                                    p.reqDecision(((input)=>{
                                            log("行動決定:"+p.getShowingName()+"("+(Object.keys(this.newresult).length+1)+"/"+Object.keys(this.todo[0]).length+")");
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
            {turn:function(cb){
                this.acceptingTurn=-1;
                return cb(this.turn(this.players,this.players.map(p=>this.result[p.id])))}.bind(this)
            },
            {nextTurn:
                function(cb){
                    if(this.result.turn){
                        this.todo=this.todo.concat(this.todoMoto);
                        this.deadPlayers=this.deadPlayers.concat(this.players.filter(v=>v.hp<=0));
                        this.players=this.players.filter(v=>v.hp>0);
                        this.turns++;
                        setTimeout(cb,0);
                    }
                }.bind(this)
            }
        ];
        this.todo=this.todoMoto.map(v=>Object.assign({},v));
        this.result={};
        this.newresult={};
    }
    tick(){
        for(let id in this.todo[0]){
            this.todo[0][id](function(id,jobs,input){
                this.newresult[id]=input;
                if(Object.keys(this.newresult).length==jobs){
                    this.todo.shift();
                    this.result=Object.assign({},this.newresult);
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
        this.todo=this.todoMoto.map(v=>Object.assign({},v));
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
                        Object.keys(player._SKILLS).reduce(
                            function(acc,skillname){
                                let available=this.checkRec(player,player._SKILLS[skillname]);
                                acc[skillname]={
                                    "name":player._SKILLS[skillname].name,
                                    "args":expansion(player._SKILLS[skillname].args.concat(args.slice(1))),
                                    "cost":player._SKILLS[skillname].getCost(player),
                                    "available":available
                                };
                                return acc;
                            }.bind(this)
                        ,{});
                    break;

                //対象（敵）
                case "opponent":
                    ret.candidates=
                        this.players.filter(p=>p.team!==player.team).map(p=>p.id).reduce(
                            function(a,playerid){
                                a[playerid]={"name":this.players.find(p=>p.id==playerid).getShowingName(),"args":expansion(args.slice(1)),"available":true};
                                return a;
                            }.bind(this)
                        ,{});
                    break;
                //対象（味方）
                case "supporter":
                    ret.candidates=
                        this.players.filter(p=>p.team==player.team).map(p=>p.id).reduce(
                            function(a,playerid){
                                a[playerid]={"name":this.players.find(p=>p.id==playerid).getShowingName(),"args":expansion(args.slice(1)),"available":true};
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
                decisions[from].skill=players[from]._SKILLS.non;
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
            let dstr=" "+damages[i].map((v,j)=>[v,"←「"+players[j].getShowingName()+"」の≪"+decisions[j].skill.name+"≫("+v+"dmg.)"]).filter(d=>d[0]>0).map(d=>d[1]).join("  ");
            let oppindex=decisions[i].skill.args.findIndex(a=>a.name=="to");
            if(oppindex!=-1){
                this.log(players[i].getShowingName()+":≪"+decisions[i].skill.name+"≫⇢「"+players.find(p=>p.id==decisions[i].args[oppindex]).getShowingName()+"」");
            }else{
                this.log(players[i].getShowingName()+":≪"+decisions[i].skill.name+"≫");
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
                    this.log("勝者...🎉 "+players.filter(v=>v.hp>0)[0].getShowingName()+" 🎉");
                    this.noticewinner(players.filter(v=>v.hp>0)[0].id);
                }
            }else{
                this.log("勝者...なし");
                this.noticewinner(null);
            }
            if(this.needokawari){
                this.log(OKAWARISEC+"秒後に次の試合");
                setTimeout(this.okawari,OKAWARISEC);
            }
            return false;
        }
    }
    checkRec(player,skill){
        return (skill.requirement.bind(null,skill))(player);
    }
    killPlayer(id){
        this.players.filter(p=>p.id==id).forEach(player=>{
            player.hp=0;
            player.reqDecision=function(cb){
                cb(new decision([player._SKILLS.non]));
            }.bind(this);
            if(this.todo.length>1 && this.todo[1].hasOwnProperty("turn")){
                this.newresult[player.id]=new decision([player._SKILLS.non]);
                if(Object.keys(this.newresult).length==Object.keys(this.todo[0]).length){
                    this.todo.shift();
                    this.result=Object.assign({},this.newresult);
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
    genDecision(args,player){
        if(args==undefined || args.length==0){
            return {skill:player._SKILLS.non,args:[]};
        }else if(args.length==1){
            return {skill:player._SKILLS[args[0]],args:[]};
        }else{
            return {skill:player._SKILLS[args[0]],args:args.slice(1)};
        }
    }
}
exports.Game=Game;
function decision(args){
    return {skill:args[0],args:args.slice(1)};
}
exports.decision=decision;
function Player(id,nickname,team,game,kit,showJobMark=false){
    this._KIT=kit;
    this._SKILLS=Object.assign({},this._KIT.skills);
    this.hp=this._KIT.hp;
    this.team=team;
    this.id=id;
    this.nickname=nickname;
    this.showingname=nickname+(showJobMark?" "+kit.mark:"");
    this.charge=0;
    this.game=game;
    this.buffs=[];
    Object.keys(Buffs).forEach((key=>this.buffs[key]=new Buffs[key](this)).bind(this));
    this.decision=function(player,supporter,opponents,candidates){return new _game.decision([this._SKILLS.non])}.bind(this);
    this.reqDecision=function(callBack,candidates){
        if(this.buffs.stu.level>0){//麻痺
        	callBack(new decision([this._SKILLS.non]));
        }else{
            //遅刻入力対策
        	if(this.game.hasOwnProperty("timeout") && this.game.timeout!=-1){
                setTimeout(callBack.bind(null,new decision([this._SKILLS.non])),this.game.timeout);
            }
            let cbw=(function(turnstart,callBack,...args){
                if(turnstart==this.acceptingTurn){
                    callBack.apply(null,args);
                }
            }).bind(this,this.acceptingTurn,callBack);
            this.reqDecisionWrapped(cbw,candidates);
        }
    }
    this.getShowingName=(()=>(this.showingname));
    this.reqDecisionWrapped=function(callBack,candidates){
        callBack(
            this.decision(
                this,
                this.game.players.filter(v=>v.team==this.team&&v!==this),
                this.game.players.filter(v=>v.team!=this.team),
            )
        );
    }.bind(this);

    this.state=function(){
        return "♥".repeat(Math.max(this.hp,0))+"   "+"☯".repeat(Math.max(this.charge,0))+"   "+Object.values(this.buffs).map(b=>b.state()).join(" ");
    }

    this.refreshBuffs=function(){
        Object.values(this.buffs).forEach(b=>b.tick());
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
function TaimanAi(id,game,param){
    Player.call(this,id,id,id,game,_KIT_NEW);
    this.isAI=true;
    this.skillsCount=Object.keys(this._SKILLS).length + 0;
    let nonSuka=this.skillsCount-1; 
    if(param.length<nonSuka){
        let paramSkills=param.length;
        let skillsDiff=nonSuka-paramSkills;
        this.param = param.map(v=>
		v.slice(0,7+paramSkills)
		.concat(Array(skillsDiff).fill(0))
		.concat(param.slice(7+paramSkills,7+paramSkills*2))
		.concat(Array(skillsDiff).fill(0)).concat(param.slice(7+paramSkills*2,7+paramSkills*3))
		.concat(Array(skillsDiff).fill(0))
	).concat(Array(skillsDiff).fill(null).map(c=>Array(this.skillsCount*3+7).fill(0)));
    }else{
        this.param=param.concat();
    }

    this.decisionCounts=Array(3).fill([]).map(v=>Array(this.skillsCount).fill(0));
    this.data=Array(Object.keys(_SKILLS_MOTO).length).fill(0);
    this.noticeDecisions=function(decisions){
        this.decisionCounts.unshift(Array(this.skillsCount).fill(0));
        this.decisionCounts.pop();
        this.decisionCounts[decisions.find(d=>d.id!=this.id).decision]++;
    };
    this.decision=function(player,supporter,opponents,candidates){
        return this.game.genDecision(this.ai(opponents[0].id,
                    [   
                        1,
                        player.hp,
                        player.charge,
                        player.buffs.str.level,
                        opponents[0].hp,
                        opponents[0].charge,
                        opponents[0].buffs.str.level,
                    ].concat(this.decisionCounts[0]).concat(this.decisionCounts[1]).concat(this.decisionCounts[2])),this);
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
            let decstr=Object.keys(this._SKILLS)[decid];
            if(this._SKILLS[decstr].args.length>0){
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
