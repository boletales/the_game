const _game=require("./game.js");
const fs = require('fs');

let input  = JSON.parse(fs.readFileSync(process.argv[2]+"/input.json"));
let output = JSON.parse(fs.readFileSync(process.argv[2]+"/output.json"));
let count = 0;
console.log(input.length+" data loaded");
input.forEach((c,i)=>{
    let testout=testTurn(c);
    if(!checkOutput(testout,output[i])){
        output[i].forEach((d,j)=>{
            console.log(c[j]);
            console.log(d);
            console.log(testout[j]);
            console.log("");
        })
        console.log("~".repeat(20));
    }else{
        count++;
    }
});
console.log("checked: "+count+"/"+input.length+" passed the test");

function checkOutput(o1,o2){
    return o1.reduce((p,c,i)=>(isSame(c,o2[i])&&p),true);
}
function isSame(p1,p2){
    return Object.keys(p1).reduce((p,c)=>((p1[c]==p2[c])&&p),true);
}

function testTurn(data){
    let players = data.map(d=>d.player).map(d=>new _game.Player(d.playerId,d.nickname,d.teamId,null,_game._KIT_STD))
    data.map(d=>d.player).map((p,i)=>{
        players[i].hp = p.hp;
        players[i].charge = p.mana;
        players[i].buffs.str.level = p.buffStr;
        players[i].game = {players:players};
    });

    let decisions = data.map(d=>d.action).map(d=>{return {skill:Object.values(_game._KIT_STD.skills).find(s=>s.name==d.skill)
                                                            ,args:[d.target]}
                                                    });


    function applyAction(actname){
        for(let from=0;from<decisions.length;from++){
            if(decisions[from].skill.hasOwnProperty(actname)){
                decisions[from].skill[actname](players[from],players,decisions,decisions[from].args);
            }
        }
    }
    players.forEach(p=>p.noticeDecisions(players.map((pl,i)=>{return {"id":pl.id,"decision":decisions[i].skill.id};})));
    players.forEach(p=>p.refreshBuffs());
    //初期処理
    
    //条件処理
    function checkReq(player,skill){
        return (skill.requirement.bind(null,skill))(player);
    }
    for(let from=0;from<decisions.length;from++){
        if(!checkReq(players[from],decisions[from].skill)){
            decisions[from].skill=players[from].skills.non;
        }
    }
        
    //攻撃処理
    let attacks=players.map(p=>[]);
    for(let from=0;from<decisions.length;from++){
        decisions[from].skill.attackPhase(players[from],players,decisions,decisions[from].args).forEach((damage,i) => {
            attacks[i].push(damage);
        });
    }
    
    //強奪処理
    applyAction("smashPhase");
    players.forEach(p=>p.buffs.chd.tick());

    //防御処理
    let damages=[];
    for(let to=0;to<decisions.length;to++){
        damages.push(decisions[to].skill.defensePhase(players[to],players,decisions,attacks[to],decisions[to].args));
    }

    //ダメージを与える
    players.forEach((p,i)=>p.hp-=damages[i].reduce((a,c)=>a+c,0));
    
    players.forEach(p=>{
        p.buffs.chd.tick();
        p.charge = Math.max(p.charge,0);
        p.hp     = Math.max(p.hp    ,0);
    });

    return players.map(p=>{return {"buffStr":p.buffs.str.level,"teamId":p.team,"mana":p.charge,"nickname":p.nickname,"hp":p.hp,"playerId":p.id};})
    
}