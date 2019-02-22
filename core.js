const _HP=20;
const _SKILLS={
    //id:技id mes:技名
    //atk:(技主,対象,対象の使用技)=>対象への攻撃力(防御前)
    //dmg:(技主,対象,対象の使用技,対象の攻撃力)=>対象からのダメージ(防御後)
    //act:技主=>使用時エフェクト
    //forone:対象は一人か (falseなら自分用の技か全体攻撃)
    //pow:威力(攻撃技専用)
    non:{id:0,mes:"スカ",forone:false,},
    def:{id:1,mes:"防御",forone:false,                                                            dmg:(p,o,od,at)=>Math.max(at-1,0)},
    atk:{id:2,mes:"攻撃",forone:true ,atk:(p,o,od)=>_SKILLS.atk.pow ,pow:1},
    chr:{id:3,mes:"溜め",forone:false,                                                            act:p=>p.charge++},
    wav:{id:4,mes:"光線",forone:true ,atk:(p,o,od)=>(od.id==_SKILLS.mir.id ? 0 : _SKILLS.wav.pow),act:p=>p.charge-- ,req:(p)=>(p.charge>0),pow:3},
    mir:{id:5,mes:"反射",forone:false,atk:(p,o,od)=>(od.id==_SKILLS.wav.id ? _SKILLS.wav.pow : 0),dmg:(p,o,od,at)=>(od.id==_SKILLS.wav.id ? 0 : at)},
    //sui:{id:7,mes:"自殺"                                                                ,act:p=>(p.hp=0)}
};

players=[];
let todoMoto=[
    {start:function(cb){logLine("★第"+turns+"ターン★");cb(null)}},
    {},
    {turn:function(cb){return cb(turn(players,players.map(p=>result[p.name])))}},
    {nextTurn:
        function(cb){
            if(result.turn){
                todo=todo.concat(todoMoto);
                todo[1+1]={};
                players=players.filter(v=>v.hp>0);
                players.forEach(v=>todo[1+1][v.name]=v.input);
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
    players.forEach(v=>todo[1][v.name]=v.input);
    tick();
}
function tick(){
    for(id in todo[0]){
        todo[0][id](function(id,jobs,input){
            newresult[id]=input;
            if(Object.keys(newresult).length==jobs){
                todo.shift();
                result=Object.assign(newresult);
                newresult={};
                tick();
            }
        }.bind(this,id,Object.keys(todo[0]).length));
    }
}
function commandInput(from,callBack){
    let onCommand=function (callBack,input){
        let _callBack=callBack;
        from.clearCommand();
        let skill=_SKILLS[input];
        if(skill.forone){
            aimInput(from,skill,_callBack);
        }else{
            _callBack(decision(from.name,from.name,skill))
        }
    }.bind(null,callBack);
    let avilableCommands=Object.keys(_SKILLS).filter(command=>
            !_SKILLS[command].hasOwnProperty("req")
            ||_SKILLS[command].req(from)
        )
    from.reqCommand(onCommand,"行動入力",avilableCommands.map(c=>{return {"name":_SKILLS[c].mes,"command":c}}));
    
    function aimInput(from,skill,callBack){
        let onAim=function(callBack,input){
            if(input=="!cancel"){
                commandInput(from,callBack);
                return;
            }
            let _callBack=callBack;
            from.clearCommand();
            _callBack(decision(from.name,input,skill));
        }.bind(null,callBack);
        from.reqCommand(onAim,"対象入力",[{"name":"キャンセル","command":"!cancel"}]
            .concat(players.filter(p=>p!==from).map(p=>{return {"name":p.name,"command":p.name}})));
    }
}
function logLine(str){
    log(str+"\n");
}


function decision(from,to,skill){
    return {from:from,to:to,skill:skill};
}
function Player(name){
    this.hp=_HP;
    this.name=name;
    this.charge=0;
    this.decision=function(o){return _SKILLS.non}.bind(this);
    this.input=function(cb){
        cb(this.decision(players.filter(v=>v!==this)))
    }.bind(this);

    this.state=function(){
        return this.name+"(hp:"+this.hp+",charge:"+this.charge+")";
    }
}


function Random(name){
    Player.call(this,name);
    this.decision=function(o){
        return decision(
            this.name,
            array_shuffle(o)[0].name,
            _SKILLS[Object.keys(_SKILLS)[Math.floor(Math.random()*Object.keys(_SKILLS).length-1)+1]]
        );
    };
}
function CPU1(name){
    Player.call(this,name);
    this.decision=function(o){
        let weakest=array_shuffle(o).sort((p1,p2)=>p1.hp-p2.hp)[0];
        if(this.charge>0){
            if(weakest.hp>=3){
                return decision(
                    this.name,
                    weakest.name,
                    _SKILLS.wav
                );
            }
        }else{
            if(Math.random()>0.7){
                return decision(
                    this.name,
                    weakest.name,
                    _SKILLS.chr
                );
            }
        }
        return decision(
            this.name,
            weakest.name,
            _SKILLS.atk
        );
    };
}
function CPU2(name){
    Player.call(this,name);
    this.decision=function(o){
        let strongest=array_shuffle(o).sort((p1,p2)=>p2.hp-p1.hp)[0];
        if(this.charge>0){
            if(strongest.hp>=3){
                return decision(
                    this.name,
                    strongest.name,
                    _SKILLS.wav
                );
            }
        }else{
            if(Math.random()>0.7){
                return decision(
                    this.name,
                    strongest.name,
                    _SKILLS.chr
                );
            }
        }
        return decision(
            this.name,
            strongest.name,
            _SKILLS.atk
        );
    };
}
function array_shuffle(arr){
    let newarr=[];
    arr.forEach(v=>newarr.splice(Math.floor((newarr.length+1)*Math.random()),0,v));
    return newarr;
}


function req(pFrom,dFrom){
    if(dFrom.hasOwnProperty("req") && !dFrom.req(pFrom)){
        return _SKILLS.non;
    }else{
        return dFrom;
    }
}
function act(p,d){
    if(d.hasOwnProperty("act")){
        d.act(p);
    }
}
function atk(pAtk,dAtk,pDef,dDef){
    if(dAtk.hasOwnProperty("atk")){
        return dAtk.atk(pAtk,pDef,dDef);
    }else{
        return 0;
    }
}
function def(pDef,dDef,pAtk,dAtk,atk){
    if(dDef.hasOwnProperty("dmg")){
        pDef.hp-=dDef.dmg(pDef,pAtk,dAtk,atk);
    }else{
        pDef.hp-=atk;
    }
}
function turn(players,decisions){
    logLine("~~~~~");
    for(let i=0;i<decisions.length;i++){
        if(decisions[i].skill.forone){
            logLine(players[i].name+" : "+decisions[i].skill.mes+"⇢"+decisions[i].to);
        }else{
            logLine(players[i].name+" : "+decisions[i].skill.mes);
        }
    }
    //条件処理
    for(let from=0;from<decisions.length;from++){
        decisions[from].skill=req(players[from],decisions[from].skill);
    }
    //行動処理
    for(let from=0;from<decisions.length;from++){
        let to=players.findIndex(v=>v.name==decisions[from].to);
        act(players[from],decisions[from].skill);
    }
    //攻撃処理
    for(let from=0;from<decisions.length;from++){
        let to=players.findIndex(v=>v.name==decisions[from].to);
        let atkpow=atk(players[from],decisions[from].skill,players[to],decisions[to].skill);
        def(players[to],decisions[to].skill,players[from],decisions[from].skill,atkpow);
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
        if(livingCount>0)logLine("勝者..."+players[0].name);
        else logLine("勝者...なし");
        turns=0;
        return false;
    }
}
