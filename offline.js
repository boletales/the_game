function log(str){
    document.getElementById("output").innerHTML+=str+"\n";
    document.getElementById("output").scrollTop = document.getElementById("output").scrollHeight;
}
sendCommand=function(){};
_game=exports;
function Human(nickname){
    _game.Player.call(this,nickname,nickname,nickname,game);
    this.input=function(callBack){
        this.game.commandInput(this,[],[{message:"行動入力",type:"action"}],undefined,callBack/*,timeout*/);
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
players=[new Human("p1"),new CPUnon("c1")];
players.forEach(p=>game.joinPlayer(p,false));
game.init();



function CPUnon(nickname){
    _game.Player.call(this,nickname,nickname,nickname,game);
    //this.input=()=>{};
}