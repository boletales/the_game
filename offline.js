function log(str){
    document.getElementById("output").innerHTML+=str;
    document.getElementById("output").scrollTop = document.getElementById("output").scrollHeight;
}
sendCommand=function(){};
function Human(name){
    Player.call(this,name);
    this.input=commandInput.bind(this,this);
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

players=[new Human("p1"),new Random("r1"),new Random("r2"),new CPU1("c1"),new CPU1("c2"),new CPU2("z1"),new CPU2("z2")];
init();