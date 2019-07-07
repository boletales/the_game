if(process==undefined)exports={};

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
const _INPUT_CANCEL="!cancel";
class Game{
    constructor(skills,args,closeGame,okawari,log,showPlayers=function(){}){
        this.log=log;
        this.teamMode   = args.hasOwnProperty("teamMode")   ?args.teamMode   :true;
        this.maxPlayers = args.hasOwnProperty("maxPlayers") ?args.maxPlayers :Infinity;
        this._HP        = args.hasOwnProperty("hp")         ?args.hp         :6;
        this.startnumber= args.hasOwnProperty("startnumber")?args.startnumber:2;
        this.todoMoto=[
            //cb:callback
            {start:function(cb){
                this.log("★第"+this.turns+"ターン★");
                this.players=this.players.concat(this.waiting.filter(p=>!p.isHuman||p.socket.connected));
                this.waiting=[];
                this.todo[1]={};
                this.players.forEach(p=>
                    this.todo[1][p.id]=
                        (cb=>{
                            p.reqDecision(((input)=>{
                                    log("行動決定:"+p.nickname+"("+(Object.keys(this.newresult).length+1)+"/"+Object.keys(this.todo[0]).length+")");
                                    cb(input);
                                }).bind(this)
                            ,this.genCommandCandidate(p));
                        }).bind(this)
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


    genCommandCandidate(player){
        let expansion=function(args){
            if(args.length>0){
                var arg=args[0];
            }else{
                return undefined;
            }
            let ret={"message":arg.message,"type":arg.type,"candidate":undefined};
            switch (arg.type) {
                //行動（使用可能なスキル,スキルの引数）
                case "action":
                    ret.candidate=
                        Object.keys(this._SKILLS).filter(command=>this.checkRec(player,this._SKILLS[command])).reduce(
                            function(a,skillname){
                                a[skillname]={"name":this._SKILLS[skillname].name,"args":expansion(this._SKILLS[skillname].args.concat(args.slice(1)))}
                                return a;
                            }.bind(this)
                        ,{});
                    break;

                //対象（敵）
                case "opponent":
                    ret.candidate=
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
    //[from]にコマンド入力を要求する
    //[argsinput]はすでに入力された事項
    //[argsleft]はこれから入力されるべき事項
    //[backToPrev]は前のステップに戻る関数
    reqCommandPlayer(from,argsinput,argsleft,backToPrev,callBack){
        switch (argsleft[0].type) {
            //行動
            case "action":
                var options=Object.keys(this._SKILLS).filter(command=>this.checkRec(from,this._SKILLS[command]));
                var optionnames=options.map(s=>this._SKILLS[s].name);
                var optionconv=(n)=>this._SKILLS[n];
                var optionargs=(n)=>n.args;
                break;

            //対象（敵）
            case "opponent":
                var options=this.players.filter(p=>p.team!==from.team).map(p=>p.id);
                var optionnames=this.players.filter(p=>p.team!==from.team).map(p=>p.nickname);
                break;
            default:
                break;
        }
        //次のステップのコマンドがキャンセルされたとき、このステップに戻る関数
        let backToThis=function (from,argsinput,argsleft,backToPrev,callBack){
            this.reqCommandPlayer(from,argsinput,argsleft,backToPrev,callBack)
        }.bind(this,from,argsinput,argsleft,backToPrev,callBack);


        //コマンド入力がされたら
        //初めのクソ長い引数はすべてbindされているので実質 function onCommand(input){}
        //from:入力者 , callback:入力終了時に呼び出し , argsinput:すでに入力された事項 , argsleft:これから入力される事項
        //残りは他参照
        let onCommand=function (from,callBack,argsinput,argsleft,optionargs,optionconv,backToThis,backToPrev,input){
            from.clearCommand();
            //キャンセルなら前のステップに戻る
            if(input==_INPUT_CANCEL){
                backToPrev();
                return;
            }

            let argsleft_new=argsleft.concat().slice(1);
            //optionconv:入力を変換("atk"->this._SKILLS["atk"])
            if(optionconv!=undefined)input=optionconv(input);


            let argsinput_new=argsinput.concat(input);
            //optionargs:入力された行動のとる引数(ex. 「攻撃」なら攻撃対象)
            if(optionargs!=undefined)argsleft_new=argsleft_new.concat(optionargs(input));

            if(argsleft_new.length==0){
                //入力すべき事項が残っていないなら決定
                callBack(decision(argsinput_new));
                from.sleepcount=0;
            }else{
                //残っているなら次の入力を求める
                this.reqCommandPlayer(from,argsinput_new,argsleft_new,backToThis,callBack);
            }
        }.bind(this,from,callBack,argsinput,argsleft,optionargs,optionconv,backToThis,backToPrev);
        
        if(argsinput.length>0){
            optionnames=["キャンセル"].concat(optionnames);
            options=[_INPUT_CANCEL].concat(options);
        }
        from.reqCommand(onCommand,argsleft[0].message,options.map((c,i)=>{return {"name":optionnames[i],"command":c}}));

        
    }

    turn(players,decisions){
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
        if(livingTeams.length>1 || this.waiting.length>0){
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
    this.reqDecision=function(cb){
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
