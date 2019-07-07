function log(str){
    document.getElementById("output").innerHTML+=str+"\n";
    document.getElementById("output").scrollTop = document.getElementById("output").scrollHeight;
}
sendCommand=function(){};
_game=exports;
function Human(nickname,game){
    _game.Player.call(this,nickname,nickname,nickname,game);
    this.reqDecision=function(callBack){
        this.game.reqCommandPlayer(this,[],[{message:"行動入力",type:"action"}],undefined,callBack/*,timeout*/);
    }.bind(this);
    this.reqCommand=function(onCommand,message,commands){
        document.getElementById("command").innerHTML=message+"≫";
        commands.forEach(com => {
            document.getElementById("command").innerHTML+="<span onclick=sendCommand('"+com.command+"') style='color:#008;border-bottom: dotted;'>"+com.name+"</span> ";                    
        });
        sendCommand=function(onCommand,command){
            onCommand(command);
        }.bind(null,onCommand);
    }.bind(this)
    this.clearCommand=function(){
        document.getElementById("command").innerHTML="";
        sendCommand=void(0);
    }
}
game=new _game.Game(_game._SKILLS_MOTO,{},()=>undefined,()=>undefined,log,()=>undefined);
players=[new Human("p1",game),new TaimanAi("c1",game,[[0.7617559292134076,0.6791157130473099,0.17626592590350848,0.5507346379662595,1.2298445474021724],[-1.367673978737579,0.2713631628241032,0.10034490707251525,0.4158241075079845,0.6303690913463449],[1.4969322170988755,0.1494162694813821,1.0146434392117252,-0.6860406271526237,0.539050544853406],[2.775704018995172,-1.4203544623682436,-0.35399077427548264,0.6126784023086047,-0.006215626535843621],[0.6365734672364673,-0.24279814896272356,-2.038337338677301,-1.4988651906701937,-0.3240290981137881]])];
players.forEach(p=>game.joinPlayer(p,false));
game.init();