if(typeof process == 'undefined'){
    var exports={};
}
const _DEF_FACTOR=2;//ダメージ半減に必要な防御バフレベル

_ATTACK_DEFAULT=(user,players,decisions,args)=>players.map(p=>0);
_DEFENSE_DEFAULT=(user,players,decisions,attacksForMe,args)=>
    attacksForMe.map((a,i)=>(
        decisions[i].skill.beam?
            Math.floor(a/(2**((user.buffs.mdefperm.level+user.buffs.mdeftemp.level)/_DEF_FACTOR))):
            Math.floor(a/(2**((user.buffs.pdefperm.level+user.buffs.pdeftemp.level)/_DEF_FACTOR)))
        )
    );
_REQUIREMENT_DEFAULT=(skill,p)=>(p.charge>=skill.getCost(p) && (!skill.hasOwnProperty("getCostEx") || p.chargeEx>=skill.getCostEx(p)));
exports._ATTACK_DEFAULT=_ATTACK_DEFAULT;
exports._DEFENSE_DEFAULT=_DEFENSE_DEFAULT;


/*
「技」型の解説です
その場しのぎの実装が多すぎて草生える 時間たってから改造しようとすると苦労するやつやこれ
特にboolの技属性周りは実装ぐっちゃぐちゃ 許して(⋈◍＞◡＜◍)。✧♡

***表記***
    配列についてはその添え字の種類を[]内に記しています
    関数については(引数...)=>返り値 と表記します
    id->プレイヤー番号
    * で始まる行はオプショナル

***解説***
    name(string):技の表示名
    args(array):技引数 今のところ対象指定のみ [{message:"ex.「対象入力」",type:"opponent|team(自分含む)|supporter",name:"今のところtoのみ"},...]
    *pow(int):技の威力
    *beam(bool):光学攻撃か 被ダメ計算・反射・強奪キャンセルに使用
    *weak(bool):光線族に相殺されるか
    *def(bool):防御族であるか 強奪キャンセルに使用
    *reflect(bool):反射族であるか 光学キャンセルに使用

    attackPhase(function array):この技の使用者から他プレイヤーへの攻撃の威力を返す(攻撃しないなら0) 必要ならここで攻撃時に必要な処理をする（☯消費とか）
                    (使用者,プレイヤーリスト[id],行動リスト[id],技引数)=>威力リスト[対象id]

    defensePhase(function array):自分への攻撃の威力リストを受け取り,各攻撃から実際に喰らうダメージを返す 必要ならここで攻撃を食らったときの処理をする（「防御」の☯吸収とか）
                    (使用者,プレイヤーリスト[id],行動リスト[id],威力リスト[攻撃者id],技引数)=>ダメージリスト[攻撃者id]

    *好きなPhaseなんでも(funciton void):game.turnに処理書けば勝手にPhase増やせる 「模倣」とか
                    (使用者,プレイヤーリスト[id],行動リスト[id],技引数)=>undefined        

    getCost(function int):(使用者)=>技コスト
    
    *getExCost(function int):(使用者)=>必殺コスト この関数が存在したら必殺技扱いだった"気がする"

    requirement(funciton bool):プレイヤーがこの技を使用できるか 実装の都合上第一引数は「この技」 判定自体はgame.checkReq(skill,player)で
                    (技,使用者)=>使用できるか

    **inherit(bool):mod系skillのみで使用 modで定義されている以外の親スキルのプロパティを受け継ぐか
*/
_SKILLS_ZERO={
    non:{name:"スカ",args:[],
        attackPhase :_ATTACK_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(0),
        requirement:_REQUIREMENT_DEFAULT,
    },


    charge:{name:"溜め",args:[],
            attackPhase:function(user,players,decisions,args){
                user.charge+=1;
                return players.map(p=>0);
            },
            getCost:(p)=>(0),
            requirement:_REQUIREMENT_DEFAULT,
            defensePhase:_DEFENSE_DEFAULT
        },
    defend:{name:"防御",args:[], 
            attackPhase:_ATTACK_DEFAULT,
            defensePhase:function(user,players,decisions,attacksForMe,args){
                return attacksForMe.map((d,i)=>(decisions[i].skill.beam ? d : 0));
            },
            getCost:(p)=>(0),
            requirement:_REQUIREMENT_DEFAULT,
            def:true,
        },
    
    mirror:{name:"反射",args:[],
            attackPhase:_ATTACK_DEFAULT,
            requirement:_REQUIREMENT_DEFAULT,
            defensePhase:function(user,players,decisions,attacksForMe,args){
                return _DEFENSE_DEFAULT(user,players,decisions,attacksForMe.map((e,i)=>decisions[i].skill.beam?0:e),args);
            },
            reflect:true,
            getCost:(p)=>(0),
        },

    attack:{name:"攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
            attackPhase:function(user,players,decisions,args){
                let attacks=players.map(p=>0);
                user.useChakra(this.getCost(user));
                let target=players.findIndex(p=>p.id==args[0]);
                attacks[target] = this.pow;
                return attacks;
            },
            pow:1,
            getCost:(p)=>(1),
            requirement:_REQUIREMENT_DEFAULT,
            weak:true,
            defensePhase:function(user,players,decisions,attacksForMe,args){
                return attacksForMe.map((d,i)=>(decisions[i].skill.beam?d:0));
            },
        },

    beam:{name:"強攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.useChakra(this.getCost(user));
            let target=players.findIndex(p=>p.id==args[0]);
            attacks[target] = this.pow;
            return attacks;
        }
        ,defensePhase:function(user,players,decisions,attacksForMe,args){
            let target=players.findIndex(p=>p.id==args[0]);
            return attacksForMe.map((d,i)=>(i==target && decisions[i].skill.reflect)?this.pow:0);
        },
        beam:true,
        pow:1,
        getCost:(p)=>(5),
        requirement:_REQUIREMENT_DEFAULT,
    },
};

_SKILLS_MOTO={
    non:{name:"スカ",args:[],
        attackPhase :_ATTACK_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(0),
        requirement:_REQUIREMENT_DEFAULT,
    },

    defend:{name:"防御",args:[], 
        attackPhase:function(user,players,decisions,args){
            user.buffs.pdeftemp.levelUp(_DEF_FACTOR);
            return players.map(p=>0);
        },
        defensePhase:function(user,players,decisions,attacksForMe,args){
            attacksForMe.forEach(d=>user.charge+=Math.max(0,d));
            return _DEFENSE_DEFAULT(user,players,decisions,attacksForMe,args);
        },
        requirement:_REQUIREMENT_DEFAULT,
        getCost:(p)=>(0),
        def:true,
    },

    attack:{name:"攻撃",args:[{message:"対象入力",type:"opponent",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            attacks[players.findIndex(p=>p.id==args[0])] = this.pow+user.buffs.str.getPower();
            return attacks;
        },
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        pow:1,
        getCost:(p)=>(0),
        weak:true,
    },

    charge:{name:"溜め",args:[],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.charge+=3;
            return attacks;
        },
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(0),
    },
    
    mirror:{name:"反射",args:[],
        attackPhase:_ATTACK_DEFAULT,
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:function(user,players,decisions,attacksForMe,args){
            return _DEFENSE_DEFAULT(user,players,decisions,attacksForMe.map((e,i)=>decisions[i].skill.beam?0:e),args);
        },
        reflect:true,
        getCost:(p)=>(0),
    },

};
_SKILLS_MOD_BEAM={
    beam:{name:"光線",args:[{message:"対象入力",type:"opponent",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.useChakra(this.getCost(user));
            let target=players.findIndex(p=>p.id==args[0]);
            attacks[target] = this.pow;
            return attacks;
        },
        defensePhase:function(user,players,decisions,attacksForMe,args){
            let target=players.findIndex(p=>p.id==args[0]);
            return attacksForMe.map((d,i)=>{
                if(i==target && decisions[i].skill.reflect){
                    return this.pow;
                }else if(decisions[i].skill.weak || (decisions[i].skill.beam && d<=this.pow)){
                    return 0;
                }else{
                    return d;
                }
            });
        },
        requirement:_REQUIREMENT_DEFAULT,
        beam:true,
        pow:3,
        getCost:(p)=>(3),
    },
};

_SKILLS_MOD_EX_LIGHTBLADE={
    exion:{name:"荷電粒子砲",args:[{message:"対象入力",type:"opponent",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.useChakraEx(this.getCostEx(user));
            let target=players.findIndex(p=>p.id==args[0]);
            attacks[target] = this.pow;
            return attacks;
        },

        defensePhase:function(user,players,decisions,attacksForMe,args){
            return attacksForMe.map((d,i)=>0);
        },
        requirement:_REQUIREMENT_DEFAULT,
        beam:true,
        pow:5,
        getCost:(p)=>(0),
        getCostEx:(p)=>(2),
    },
};

_SKILLS_MOD_EX_HARDEN={
    exharden:{name:"装甲強化",args:[{message:"対象入力",type:"team",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            user.useChakraEx(this.getCostEx(user));
            let target=players.find(p=>p.id==args[0]);
            target.buffs.pdefperm.levelUp(1);
            target.buffs.mdefperm.levelUp(1);
            return players.map(p=>0);
        },

        defensePhase:function(user,players,decisions,attacksForMe,args){
            return attacksForMe.map((d,i)=>0);
        },
        requirement:_REQUIREMENT_DEFAULT,
        getCost:(p)=>(0),
        getCostEx:(p)=>([2,5,Infinity][Math.min(2,Math.max(p.buffs.mdefperm.level,p.buffs.pdefperm.level))]),
    },
};

_SKILLS_MOD_COVER={
    cover:{name:"護衛",args:[{message:"対象入力",type:"supporter",name:"to"}], 
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.useChakra(this.getCost(user));
            players.find(p=>p.id==args[0]).buffs.pdeftemp.levelUp(1);
            return attacks;
        },
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(2),
    },
};
_SKILLS_MOD_HEAL={
    heal:{name:"回復",args:[{message:"対象入力",type:"team",name:"to"}], 
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.useChakra(this.getCost(user));
            players.find(p=>p.id==args[0]).hp += 3;
            return attacks;
        },
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(6),
    },
};
_SKILLS_MOD_HEALPLUS={
    teamheal:{name:"全体回復",args:[], 
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.useChakra(this.getCost(user));
            players.filter(p=>p.team==user.team).forEach(p=>p.hp += 3);
            return attacks;
        },
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(6),
    },
    megaheal:{name:"強回復",args:[{message:"対象入力",type:"team",name:"to"}], 
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.useChakra(this.getCost(user));
            players.find(p=>p.id==args[0]).hp += 6;
            return attacks;
        },
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(6),
    },
};
_SKILLS_MOD_ATPLUS={
    strengthen:{name:"強化",args:[],
        attackPhase:function(user,players,decisions,args){
            user.useChakra(this.getCost(user));
            user.buffs.str.levelUp();
            return players.map(p=>0);
        },
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>{
            let costs=[4,7,10];
            return (p.buffs.str.level < costs.length) ? costs[p.buffs.str.level] : Infinity;
        },
    },
};
_SKILLS_MOD_STUN={
    stun:{name:"麻痺",args:[{message:"対象入力",type:"opponent",name:"to"}], 
        attackPhase:function(user,players,decisions,args){
            user.useChakra(this.getCost(user));
            let target=players.findIndex(p=>p.id==args[0]);
            if(decisions[target].skill.reflect){
                user.buffs.stun.level++;
            }else{
                players[target].buffs.stun.level++;
            }
            let attacks=players.map(p=>0);
            return attacks;
        },
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        getCost:(p)=>(3),
    },
};
_SKILLS_MOD_SMASH={
    smash:{name:"強奪",args:[{message:"対象入力",type:"opponent",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            let targetIndex=players.findIndex(p=>p.id==args[0]);
            attacks[targetIndex] = this.pow+user.buffs.str.getPower();
            return attacks;
        },
        smashPhase:function(user,players,decisions,args){
            let targetIndex=players.findIndex(p=>p.id==args[0]);
            if(  !decisions[targetIndex].skill.def 
                &&!decisions[targetIndex].skill.beam){
                
                let target=players.find(p=>p.id==args[0]);
                target.buffs.chd.levelUp(2)
                user.charge+=Math.min(target.charge,2);
            }else{
                user.useChakra(this.getCost(user));
            }
            let opp=players.find(p=>p.id==args[0]);
            opp.buffs.chd.tick();
        },
        defensePhase:_DEFENSE_DEFAULT,
        requirement:_REQUIREMENT_DEFAULT,
        pow:1,
        getCost:(p)=>(2),
        weak:true,
    },
};
_SKILLS_MOD_EXPLODE={
    explode:{name:"爆発",args:[],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            user.useChakra(this.getCost(user));
            let at=this.pow+user.buffs.str.getPower();
            user.game.players.forEach((p,i)=>{
                if(p.team!=user.team){
                    attacks[i]=at;
                }
            });
            return attacks;
        },
        defensePhase:_DEFENSE_DEFAULT,
        requirement:_REQUIREMENT_DEFAULT,
        pow:1,
        getCost:((p)=>(_SKILLS_MOD_EXPLODE.explode.countOpponents(p)*(_SKILLS_MOD_EXPLODE.explode.pow+p.buffs.str.getPower()))),
        countOpponents:((user)=>user.game.players.filter(p=>p.team!=user.team).length),
        weak:true,
    },
};
_SKILLS_MOD_SALVO={
    salvo:{name:"斉射",args:[{message:"対象入力",type:"opponent",name:"to"}],
        attackPhase:function(user,players,decisions,args){
            let attacks=players.map(p=>0);
            attacks[players.findIndex(p=>p.id==args[0])] = user.charge+user.buffs.str.getPower();
            user.charge=0;
            return attacks;
        },pow:1,
        defensePhase:_DEFENSE_DEFAULT,
        requirement:_REQUIREMENT_DEFAULT,
        getCost:(p)=>Math.max(p.charge,1),
        weak:true,
        pow:1,
    },
};

_SKILLS_MOD_COPY={
    copy:{name:"模倣",args:[{message:"対象入力",type:"opponent",name:"to"}], 
	    prePhaseCopyA:function(user,players,decisions,args){
            let targetIndex=players.findIndex(p=>p.id==args[0]);
            let myIndex=players.findIndex(p=>p.id==user.id);
            let targetSkill=decisions[targetIndex].skill;
            let skillArgs=targetSkill.args.map(e=>{
                if(e.type=="opponent"){
                    return args[0];
                }else if(e.type=="team"||e.type=="supporter"){
                    return user.id;
                }else{
                    return undefined;
                }
            }).filter(e=>e!=undefined);
            decisions[myIndex].args.push({skill:targetSkill,args:skillArgs}); 
	    },
	    prePhaseCopyB:function(user,players,decisions,args){
            decisions[players.findIndex(p=>p.id==user.id)]=args[args.length-1];
        },
        attackPhase:_ATTACK_DEFAULT,
        requirement:_REQUIREMENT_DEFAULT,
        defensePhase:_DEFENSE_DEFAULT,
        copy:true,
        getCost:(p)=>(0),
    },
};

_SKILLS_MOD_ATPLUS_FIGHTER={
    strengthen:{   
        inherit:true,
        getCost:(p)=>{
            let costs=[0,4,7,10];
            return (p.buffs.str.level < costs.length) ? costs[p.buffs.str.level] : Infinity;
        },
    },
};


/*
「バフ」型の解説です

***解説***
    id(string):バフid
    level(int property):バフの強さ
    user(Player property):バフの持ち主
    tick(function void):ターン経過時のアクション ()=>undefined
    state(function str):()=>現在のバフレベルに応じた表示文字列
*/
const Buffs={
    //↓物理攻撃強化
    str:function(user){
        this.tick=function(){};
        this.level=0;
        this.user=user;
        this.id="str";
        this.getPower=function(){
            return this.level;
        }.bind(this);
        this.levelUp=function(){
            this.level++;
        }.bind(this);
        this.state=function(){
            return "⚔".repeat(this.level);
        }.bind(this);
    },
    //↓麻痺
    stun:function(user){
        this.tick=function(){
        	if(this.level>0)this.level--;
        }.bind(this);
        this.level=0;
        this.user=user;
        this.id="stun";
        this.state=function(){
            return "⚡️".repeat(this.level);
        }.bind(this);
    },
    //↓☯減少
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
    //↓物理防御(永続)
    pdefperm:function(user){
        this.tick=(()=>(undefined));
        this.level=0;
        this.user=user;
        this.id="pdefperm";
        this.state=(()=>"⛑".repeat(this.level)).bind(this);
        this.levelUp=(level=>(this.level+=level)).bind(this);
    },
    //↓物理防御(1ターン)
    pdeftemp:function(user){
        this.tick=function(){
            this.level=0;
        }.bind(this);
        this.level=0;
        this.user=user;
        this.id="pdeftemp";
        this.state=(()=>"");
        this.levelUp=(level=>(this.level+=level)).bind(this);
    },
    //↓魔法防御(永続)
    mdefperm:function(user){
        this.tick=(()=>(undefined));
        this.level=0;
        this.user=user;
        this.id="mdefperm";
        this.state=(()=>"☂".repeat(this.level)).bind(this);
        this.levelUp=(level=>(this.level+=level)).bind(this);
    },
    //↓魔法防御(1ターン)
    mdeftemp:function(user){
        this.tick=function(){
            this.level=0;
        }.bind(this);
        this.level=0;
        this.user=user;
        this.id="mdeftemp";
        this.state=(()=>"");
        this.levelUp=(level=>(this.level+=level)).bind(this);
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

function Kit(name,skills,hp,mark,turnend){
    this.skills=skills;
    this.hp=hp;
    this.name=name;
    this.mark=mark;
    this.turnend=turnend;
}
//逆境関数(副作用なし)
function calcAdvIndex(me,players){
    const _T=8;//teammate factor(人数差)
    const _H=4;//heart factor(体力差)
    const _C=1/3;//chakra factor(魔力差)
    let teamCounts=players.reduce((a,c)=>{
        if(a.hasOwnProperty(c.team)){
            a[c.team]++;
        }else{
            a[c.team]=1;
        }
        return a;
    },{});

    let countdiff=Math.max(...(Object.keys(teamCounts).filter(t=>t!=me.team).map(t=>teamCounts[t])))-teamCounts[me.team];
    if(isNaN(countdiff))countdiff=0;
    let heartdiff=Math.log(Math.max(...players.filter(p=>p.team!=me.team).map(p=>p.hp+3))/(me.hp+3))/Math.log(2);
    if(isNaN(heartdiff))heartdiff=0;
    let chakradiff=Math.max(...players.filter(p=>p.team!=me.team).map(p=>p.charge))-me.charge;
    if(isNaN(chakradiff))chakradiff=0;
    return 0.1*Math.max(0,Math.floor(countdiff*_T + heartdiff*_H + chakradiff*_C));
}

let _TURNEND_NONTEAM_DEFAULT=(function(me,players){return;});
let _TURNEND_TEAM_DEFAULT   =(function(me,players){
    me.chargeEx += calcAdvIndex(me,players);
});

let _KIT_OLD=new Kit("初期版",_SKILLS_MOTO,6,"",_TURNEND_NONTEAM_DEFAULT);

let _KIT_ZERO=new Kit("原作",_SKILLS_ZERO,1,"",_TURNEND_NONTEAM_DEFAULT);

let _KIT_STD=new Kit("スタンダード",mergeSkills({},[   
                            _SKILLS_MOTO,
                            _SKILLS_MOD_BEAM,
                            _SKILLS_MOD_HEAL,
                            _SKILLS_MOD_ATPLUS,
                            _SKILLS_MOD_SMASH,
                            _SKILLS_MOD_EXPLODE,
                            _SKILLS_MOD_SALVO,
                        ]),7,"",_TURNEND_NONTEAM_DEFAULT);

let _KIT_JSTD=new Kit("スタンダード",mergeSkills(_KIT_STD.skills,[   
                            _SKILLS_MOD_COVER,
                            _SKILLS_MOD_EX_LIGHTBLADE,
                            _SKILLS_MOD_EX_HARDEN,
                        ]),7,"(標)",_TURNEND_TEAM_DEFAULT);

let _KIT_FIGHTER=new Kit("戦士",mergeSkills({},[   
                            _SKILLS_MOTO,
                            _SKILLS_MOD_ATPLUS,
                            _SKILLS_MOD_ATPLUS_FIGHTER,
                            _SKILLS_MOD_BEAM,
                            _SKILLS_MOD_SMASH,
                            _SKILLS_MOD_SALVO,
                            _SKILLS_MOD_COVER,
                            _SKILLS_MOD_EX_LIGHTBLADE,
                            _SKILLS_MOD_EX_HARDEN,
                        ]),7,"(戦)",(function(me,players){
                            _TURNEND_TEAM_DEFAULT(me,players);
                            me.buffs.str.level=Math.max(me.buffs.str.level,1);
                        }));

let _KIT_HEALER=new Kit("白魔導師",mergeSkills({},[   
                            _SKILLS_MOTO,
                            _SKILLS_MOD_HEALPLUS,
                            _SKILLS_MOD_ATPLUS,
                            _SKILLS_MOD_SMASH,
                            _SKILLS_MOD_EX_LIGHTBLADE,
                            _SKILLS_MOD_EX_HARDEN,
                        ]),7,"(白)",_TURNEND_TEAM_DEFAULT);

let _KIT_TRICK=new Kit("トリック",mergeSkills({},[   
                            _SKILLS_MOTO,
			                _SKILLS_MOD_COPY,
                        ]),7,"(奇)",_TURNEND_TEAM_DEFAULT);
let kitsets={
    "スタンダード":{set:[_KIT_STD],useEx:false},
    "ジョブあり":{set:[_KIT_JSTD,_KIT_HEALER,_KIT_FIGHTER,],useEx:true},
    "原作":{set:[_KIT_ZERO],useEx:false},
};

exports.kitsets=kitsets;
exports._KIT_OLD=_KIT_OLD;
exports._KIT_STD=_KIT_STD;
exports._KIT_FIGHTER=_KIT_FIGHTER;

exports._SKILLS_MOTO=_SKILLS_MOTO;
exports._HP_DEFAULT=6;

const OKAWARISEC=5;

class Game{
    constructor(kits,args,closeGame,okawari,log,showPlayers=function(){},noticewinner=function(){},needokawari=true,sendBattleLog=function(){},sendRatingLog=function(){}){
        this.kits=kits.set;
        this.useEx=kits.useEx;
        this.sendlog=function(){
            let str=this.logbuffer.join("\n");
            log(str);
            this.logbuffer=[];
        };
        this.sendBattleLog=sendBattleLog;
        this.sendRatingLog=sendRatingLog;
        this.logbuffer=[];
        this.log=function(str){this.logbuffer.push(str)};
        this.noticewinner= noticewinner;
        this.needokawari = needokawari;
        this.playersLog  = [];//id,isHuman,isRanked,playerid
        this.teamMode    = args.hasOwnProperty("teamMode")   ?args.teamMode   :true;
        this.maxPlayers  = args.hasOwnProperty("maxPlayers") ?args.maxPlayers :Infinity;
        this.startnumber = args.hasOwnProperty("startnumber")?args.startnumber:2;
        this.maxTurns    = args.hasOwnProperty("maxTurns")   ?args.maxTurns   :Infinity;
        this.kits.map(k=>Object.keys(k.skills)).flat()
            .reduce((a,c)=>a.includes(c)?a:a.concat(c),[])
            .forEach((n,i)=>this.kits.forEach(k=>{
                if(k.hasOwnProperty(n)){
                    let skcp=Object.assign({},k[n]);
                    skcp.id=i;
                    k[n]=skcp;
                }
            }));
        
        this.battleLog=[];
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
                if(this.turns==1){
                    this.players.forEach(p=>{
                        this.log("「"+p.getShowingName()+"」参戦！！");
                    });
                }
                this.waiting.filter(p=>!p.isHuman||p.socket.connected).forEach(p=>{
                    this.dealJoin(p);
                    this.log("「"+p.getShowingName()+"」参戦！！");
                });
                this.sendlog();
                this.waiting=[];
                this.todo[1]={};
                this.acceptingTurn=this.turns;
                this.players.forEach(p=>{
                    this.todo[1][p.id]=
                        (cb=>{
                            p.reqDecision(((input)=>{
                                    this.log("行動決定:"+p.getShowingName()+"("+(Object.keys(this.newresult).length+1)+"/"+Object.keys(this.todo[0]).length+")");
                                    this.sendlog();
                                    cb(input);
                                }).bind(this)
                            ,this.genCommandcandidates(p));
                        }).bind(this);
                });
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
    dealJoin(player){
        this.players.push(player);
        this.playersLog.push({id:player.id,isHuman:player.isHuman,isRanked:player.isRanked,playerid:player.playerid});
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
                        Object.keys(player.skills).reduce(
                            function(acc,skillname){
                                let skill=player.skills[skillname];
                                let available=this.checkReq(player,skill);
                                acc[skillname]={
                                    "name":skill.name,
                                    "args":expansion(skill.args.concat(args.slice(1))),
                                    "cost":skill.getCost(player),
                                    "available":available
                                };
                                if(skill.hasOwnProperty("getCostEx")){
                                    acc[skillname].ex=true;
                                    acc[skillname].costEx=skill.getCostEx(player);
                                }
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
                //対象（自分含む味方）
                case "team":
                    ret.candidates=
                        this.players.filter(p=>p.team==player.team).map(p=>p.id).reduce(
                            function(a,playerid){
                                a[playerid]={"name":this.players.find(p=>p.id==playerid).getShowingName(),"args":expansion(args.slice(1)),"available":true};
                                return a;
                            }.bind(this)
                        ,{});
                    break;
                //対象（味方）
                case "supporter":
                    ret.candidates=
                        this.players.filter(p=>p.team==player.team && p.id!=player.id).map(p=>p.id).reduce(
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
        function applyAction(actname){
            for(let from=0;from<decisions.length;from++){
                if(decisions[from].skill.hasOwnProperty(actname)){
                    decisions[from].skill[actname](players[from],players,decisions,decisions[from].args);
                }
            }
        }

        this.battleLog.push(players.map((p,i)=>({
            id:p.id,
            nickname:p.nickname,
            decision:{skill:decisions[i].skill.name,args:decisions[i].args},
            before:p.getStateData()})
        ));
        players.forEach(p=>p.noticeDecisions(players.map((pl,i)=>{return {"id":pl.id,"decision":decisions[i].skill.id};})));
        players.forEach(p=>p.refreshBuffs());
        //初期処理
        //模倣計算
        applyAction("prePhaseCopyA");
        
        //条件処理
        for(let from=0;from<decisions.length;from++){
            if(!this.checkReq(players[from],decisions[from].skill)){
                decisions[from].skill=players[from].skills.non;
            }
        }

        //模倣適用
        applyAction("prePhaseCopyB");
            
        //攻撃処理
        let attacks=players.map(p=>[]);
        for(let from=0;from<decisions.length;from++){
            decisions[from].skill.attackPhase(players[from],players,decisions,decisions[from].args).forEach((damage,i) => {
                attacks[i].push(damage);
            });
        }
        
        //強奪処理
        applyAction("smashPhase");

        //防御処理
        let damages=[];
        for(let to=0;to<decisions.length;to++){
            damages.push(decisions[to].skill.defensePhase(players[to],players,decisions,attacks[to],decisions[to].args));
        }

        //ダメージを与える
        players.forEach((p,i)=>p.hp-=damages[i].reduce((a,c)=>a+c,0));

        //結果記録
        players.forEach((p,i)=>this.battleLog[this.battleLog.length-1][i].after=p.getStateData());
        //結果表示
        this.log("~~~~~");
        let livingTeams=[];
        players.filter(v=>v.hp>0).forEach(p=>livingTeams.indexOf(p.team)==-1&&livingTeams.push(p.team));

        if(livingTeams.length>0){
            players.filter(v=>v.hp>0).forEach(p=>p.turnend(p,players));
        }
        this.getSortedPId().forEach((i)=>{
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
                this.log("  "+players[i].getState()+dstr);
            }
            this.log("");
        });
        
        this.showPlayers(this.getSortedPId().map(i=>players[i]));
        this.log("~~~~~");
        if((livingTeams.length>1 || this.waiting.length>0) && this.turns<this.maxTurns){
            this.sendlog();
            return true;
        }else{
            this.sendBattleLog(this.battleLog);
            this.log("試合終了");
            if(livingTeams.length!=1){
                this.log("勝者...なし");
                this.noticewinner(null);
            }else if(this.teamMode){
                this.log("勝者...🎉 チーム「"+livingTeams[0]+"」 🎉");
                this.noticewinner(livingTeams[0]);
            }else{
                this.log("勝者...🎉 "+players.filter(v=>v.hp>0)[0].getShowingName()+" 🎉");
                this.noticewinner(players.filter(v=>v.hp>0)[0].id);
            }
            if(this.wasRankedTaimanGame()){
                if(livingTeams.length!=1)var result=0.5
                else if(players.filter(v=>v.hp>0)[0].id==this.playersLog[0].id)var result=0;
                else if(players.filter(v=>v.hp>0)[0].id==this.playersLog[1].id)var result=1;
                else var result=0.5;

                let body={"time":this.getDateStr(),"players":this.playersLog.map(p=>p.playerid),"result":result};
                this.sendRatingLog(body);
            }
            if(this.needokawari){
                this.log(OKAWARISEC+"秒後に次の試合");
                setTimeout(this.okawari,OKAWARISEC*1000);
            }
            this.sendlog();
            return false;
        }
    }
    getDateStr(){
        let pad0=(str,len)=>("0".repeat(len)+str).slice(-len);
        let now=new Date();
        return pad0(now.getFullYear(),4)+"-"+pad0(now.getMonth(),2)+"-"+pad0(now.getDate(),2)+" "+pad0(now.getHours(),2)+":"+pad0(now.getMinutes(),2)+":"+pad0(now.getSeconds(),2);
    }
    wasRankedTaimanGame(){
        return  this.playersLog.length==2 &&
                this.playersLog.every(p=>p.isRanked) &&
                this.playersLog.every(p=>p.isHuman) &&
                this.playersLog.every(p=>!p.isKicked) &&
                this.playersLog.every(p=>p.hasOwnProperty("playerid")) &&
                this.playersLog[0].playerid != this.playersLog[1].playerid;
    }
    checkReq(player,skill){
        return (skill.requirement.bind(null,skill))(player);
    }
    killPlayer(id){
        this.players.filter(p=>p.id==id).forEach(player=>{
            if(this.playersLog.findIndex(p=>p.id==id)!=-1)this.playersLog.find(p=>p.id==id).isKicked=true;
            player.hp=0;
            player.reqDecision=function(cb){
                cb(new decision([player.skills.non]));
            }.bind(this);
            if(this.todo.length>1 && this.todo[1].hasOwnProperty("turn")){
                this.newresult[player.id]=new decision([player.skills.non]);
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
    getSortedPId(){
        if(this.teamMode){
            return this.players.map((p,i)=>({player:p,id:i}))
                                .sort((a,b)=>sortFun_byName(a.player.nickname,b.player.nickname))
                                .sort((a,b)=>sortFun_byStr(a.player.team,b.player.team))
                                .map(d=>d.id);
        }else{
            return this.players.map((p,i)=>({player:p,id:i}))
                                .sort((a,b)=>sortFun_byName(a.player.nickname,b.player.nickname))
                                .map(d=>d.id);
        }
    }
    joinPlayer(player,start=true){
        if(!this.aki()){
            return false;
        }
        if(this.turns==0){
            this.dealJoin(player);
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
            return {skill:player.skills.non,args:[]};
        }else if(args.length==1){
            return {skill:player.skills[args[0]],args:[]};
        }else{
            return {skill:player.skills[args[0]],args:args.slice(1)};
        }
    }
}
exports.Game=Game;
function decision(args){
    return {skill:args[0],args:args.slice(1)};
}
exports.decision=decision;
function Player(id,nickname,team,game,kit,showJobMark=false,suffix=""){
    this._KIT=kit;
    this.skills=Object.assign({},this._KIT.skills);
    this.turnend=kit.turnend;
    this.hp=this._KIT.hp;
    this.team=team;
    this.id=id;
    this.nickname=nickname;
    this.showingname=nickname+suffix+(showJobMark?" "+kit.mark:"");
    this.charge=0;
    this.chargeEx=0;
    this.game=game;
    this.buffs=[];
    Object.keys(Buffs).forEach((key=>this.buffs[key]=new Buffs[key](this)).bind(this));
    this.decision=function(player,supporter,opponents,candidates){return new _game.decision([this.skills.non])}.bind(this);
    this.reqDecision=function(callBack,candidates){
        if(this.buffs.stun.level>0){//麻痺
        	callBack(new decision([this.skills.non]));
        }else{
            //遅刻入力対策
        	if(this.game.hasOwnProperty("timeout") && this.game.timeout!=-1){
                setTimeout(callBack.bind(null,new decision([this.skills.non])),this.game.timeout);
            }
            let cbw=(function(turnstart,callBack,...args){
                if(turnstart==this.acceptingTurn){
                    callBack.apply(null,args);
                }
            }).bind(this,this.acceptingTurn,callBack);
            this.reqDecisionWrapped(cbw,candidates);
        }
    }

    this.useChakra=(cost)=>{
        this.charge=Math.max(0,this.charge-cost);
    }
    this.useChakraEx=(cost)=>{
        this.chargeEx=Math.max(0,this.chargeEx-cost);
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

    this.getState=function(){//プレイヤーの状態（文字列）
        return "♥".repeat(Math.max(this.hp,0))+"   "+"☯".repeat(Math.max(this.charge,0))+(this.game.useEx?"   Ex:"+this.chargeEx.toFixed(1):"")+"   "+Object.values(this.buffs).map(b=>b.state()).join(" ");
    }
    this.getStateData=function(){//プレイヤーの状態（オブジェクト）
        return {hp:this.hp,charge:this.charge,chargeEx:this.chargeEx,buffs:this.buffs.map(b=>({id:b.id,level:b.level}))};
    }

    this.refreshBuffs=function(){
        Object.values(this.buffs).forEach(b=>b.tick());
    }
    this.clearCommand=function(){};

    this.noticeDecisions=function(decisions){};
}

function sortFun_byStr(a,b){
    if(a>b){
        return 1;
    }else if(a<b){
        return -1;
    }else{
        return 0;
    }
}

function sortFun_byName(_a,_b){
    var a = _a.toUpperCase(); // 大文字と小文字を無視する
    var b = _b.toUpperCase(); // 大文字と小文字を無視する
    return sortFun_byStr(a,b);
}
function array_shuffle(arr){
    let newarr=[];
    arr.forEach(v=>newarr.splice(Math.floor((newarr.length+1)*Math.random()),0,v));
    return newarr;
}
exports.Player=Player;



//param: [action][data]
function TaimanAi(id,game,param){
    Player.call(this,id,id,id,game,_KIT_STD);
    this.isAI=true;
    this.skillsCount=Object.keys(this.skills).length + 0;
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
            let decstr=Object.keys(this.skills)[decid];
            if(this.skills[decstr].args.length>0){
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
