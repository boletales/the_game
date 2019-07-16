const _game=require("./game.js");
const app=require('express')();
const http=require('http').createServer(app);
const socketIO=require('socket.io');
const io=socketIO.listen(http);
const _TIMEOUT_SECONDS=240;
var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(40);
rooms={};

let globalRecentLog=[];
let globalRecentLogMax=20;

app.get('/',function(req,res){
    res.sendFile(__dirname+'/docs/index.html');
});
app.get('/make.html',function(req,res){
    res.sendFile(__dirname+'/docs/make.html');
});
app.get('/rooms/:roomid',function(req,res){
    res.sendFile(__dirname+'/docs/game.html');
});
app.get('/clear',function(req,res){
    globalRecentLog=[];
    rooms={};
    io.emit("goRobby",{});
    res.redirect('/');
});
io.on('connection',function(socket){
    socket.join("robby");
    showRoomState();
    socket.on("makeRoom",data=>{
        makeRoomAndJoin(socket,data.name,data.args);
    });
    socket.on("joinRoom",data=>{
        joinRoom(data.roomid,socket,data.nickname,data.team);
    });
    socket.on("joinTaiman",data=>{
        joinTaiman(socket);
    });
    socket.on("joinAiman",data=>{
        joinAiman(socket);
    });
    socket.on('globalChat',function(data){
        io.emit("globalMessage",data);
        globalRecentLog.push(data);
        if(globalRecentLog.length>globalRecentLogMax)globalRecentLog.shift();
    });
    socket.on('getGlobalLog',function(data){
        sendGlobalRecentLog(socket);
    });
    socket.on("getRoomData",data=>{
        if(rooms.hasOwnProperty(data.id)){
            socket.emit(rooms[data.id].showData(socket));
        }
    });
});
http.listen(process.env.PORT || 80);
console.log('It works!!');

function sendGlobalRecentLog(socket){
    globalRecentLog.forEach(data=>
            socket.emit("globalMessage",data)
        ); 
}

function randomID(keta){
    return ("0".repeat(keta)+Math.floor(Math.random()*Math.pow(10,keta))).slice(-keta);
}
function makeRoom(name,args){
    let r=new Room(name,rooms,args);
    rooms[r.id]=r;
    return r.id;
}
function makeRoomAndJoin(socket,name,args){
    socket.emit("goRoom",{id:makeRoom(name,args)});
}
function joinRoom(roomid,socket,nickname,team){
    if(rooms.hasOwnProperty(roomid)){
        socket.join(roomid);
        if(rooms[roomid].join(socket,nickname,team)){
            showRoomState();
        }else{
            socket.emit("goRobby",{});
            socket.disconnect();
        }
    }else{
        socket.emit("goRobby",{});
    }
}
function joinTaiman(socket){
    let trooms=Object.values(rooms).filter(r=>r.taiman);
    let available=trooms.filter(r=>r.game.countJoined()<2);
    if(available.length>0){
        var room=available[0];
    }else{
        let name="タイマン"+("000"+(trooms.length+1)).slice(-3);
        var room=new TaimanRoom(name,rooms);
        rooms[room.id]=room;
    }
    socket.emit("goRoom",{id:room.id});
}

function joinAiman(socket){
    let trooms=Object.values(rooms).filter(r=>r.aiman);
    let name="AIタイマン"+("000"+(trooms.length+1)).slice(-3);
    var room=new AimanRoom(name,rooms);
    rooms[room.id]=room;
    socket.emit("goRoom",{id:room.id});
}
function showRoomState(){
    var avr= Object.values(rooms).filter(r=>r.game.countJoined()>0);
    io.to("robby").emit("roomStates",{
        rooms:  avr.filter(room=>!room.hidden).map(room=>({name:room.name,id:room.id,number:room.getNumber()})),
        taiman: avr.filter(r=>r.taiman).filter(r=>r.game.countJoined()<2).length>0,
    });
}
class Room{
    constructor(name,parent,args={}){
        this.recentLog=[];
        this.recentLogMax=20;
        this.name=name;
        this.id=generateUuid();
        this.args=args;
        this.taiman=this.args.taiman;
        this.parent=parent;
        this.hidden=args.hasOwnProperty("hidden")&&args.hidden;
        this.game=new _game.Game(_game._RULE_NEW,args,this.closeGame.bind(this),this.okawari.bind(this),this.log.bind(this),this.showPlayers.bind(this));
        this.teamMode=this.game.teamMode;
    }
    getNumber(){
        if(io.sockets.adapter.rooms[this.id]==undefined){
            delete rooms[this.id];
            return 0;
        }
        return Object.keys(io.sockets.adapter.rooms[this.id].sockets).length;
    }
    join(socket,nickname,team){
        if(!this.args.hasOwnProperty("teamMode")||this.args.teamMode){
            var newPlayer=(new Human(nickname,team,this.game,socket));
        }else{
            var newPlayer=(new Human(nickname,socket.id,this.game,socket));
        }
        if(this.game.joinPlayer(newPlayer)){
            socket.emit("joined",{"id":nickname,"team":team,"teamMode":this.teamMode});
            this.log("connected:"+nickname);
            socket.on('chat',function(data){
                this.chat(data);
                if(data.message.startsWith("!")) this.command(data.message.slice(1));
            }.bind(this));
            socket.on('disconnect',((data)=>{
                this.game.players.filter(p=>p.hasOwnProperty("socket")).filter(p=>p.socket==socket).forEach(function(player){
                    this.log("disconnected:"+player.nickname);
                    this.game.killPlayer(player.id);
                }.bind(this));
                if(this.getNumber()==0)this.closeGame();
                showRoomState();
            }).bind(this));
            return true;
        }else{
            return false;
        }
    }
    
    showData(socket){
        this.sendRecentLog(socket);
        this.game.showPlayers();
        socket.emit("roomData",{name:this.name,teamMode:this.game.teamMode,available:this.game.aki()});
    }

    log(str){
        this.chat({"name":"★system","message":str});
    }

    chat(data){
        data.time=new Date();
        io.to(this.id).emit('message',data);
        process.stdout.write(this.name+":"+data.name+"≫"+data.message+"\n");
        this.recentLog.push(data);
        if(this.recentLog.length>this.recentLogMax)this.recentLog.shift();
    }

    sendRecentLog(socket){
        this.recentLog.forEach(data=>
                socket.emit("message",data)
            ); 
    }

    showPlayers(players){
        players.filter(p=>p.hasOwnProperty("socket")).map(player=>{
            player.socket.emit("showPlayers",
                {
                    others:players.filter(p=>p!==player).map(p=>({name:p.nickname,state:p.state(),team:p.team}))
                    ,you:{name:player.nickname,state:player.state(),team:player.team}
                });
        });
    }

    closeGame(){
        this.game.players.filter(p=>p.hasOwnProperty("socket")).map(player=>{
            player.socket.emit("goRobby",{});
        });
        if(rooms[this.name]==this){
            delete rooms[this.name];
        }
    }

    okawari(){
        let roomid=makeRoom(this.name,this.args);
        if(io.sockets.adapter.rooms[this.id]!=undefined){
            let humans=Object.keys(io.sockets.adapter.rooms[this.id].sockets);
            rooms[roomid].game.setStartnumber(humans.length);
            humans.map(((roomid,socketid)=>{
                let socket=io.sockets.sockets[socketid];
                let player=this.game.players.find(p=>p.socket==socket);
                if(player){
                    socket.emit("okawari",{nickname:player.nickname,team:player.team,roomid:roomid});
                }else{
                    socket.emit("okawari",{roomid:roomid});
                } 
            }).bind(null,roomid));
        }
    }

    command(_com){
        let com=_com.split(" ");
        switch (com[0]) {
            case "reset":
                resetGame();
                break;

            case "kick":
                if(this.game!=undefined && this.game.killPlayer!=undefined)(this.game.killPlayer(com[1]));
                break;

            case "startnumber":
                if(this.game!=undefined && this.game.setStartnumber!=undefined)(this.game.setStartnumber(parseInt(com[1])));
                break;
        
            default:
                break;
        }
    }
}
class TaimanRoom extends Room{
    constructor(name,parent){
        super(name,parent,{teamMode:false,maxPlayers:2,hidden:true,taiman:true});
    }
}
const AIs=[
    [[-0.05640942529909543,0.20860565880389892,0,-0.8909014011697909,0,-0.7438341943372209,-0.1616810540024165,-0.10672178241336838,0.30273797868429714,0,0,-0.27067296050386647,0.16866652697566886,0.7014823220817739,0,0.184741525421374,1.2332991585696582,-0.35401111300289667,0,1.302828140852978,0,0.27240511407594914,0],[-0.7030865258454231,-0.34623533218944713,0.13140486659405748,0,-0.06980329023527121,0.36326876745729075,0,-0.29809297758613335,0,-0.6974711825862099,0,0.20422787848992408,0,-0.3327411055013576,-0.29806586516593625,0,0,0,0,-0.7228770694374373,-0.879324536376078,-0.001028355087315802,-0.41704682312574115],[0.554564972076398,0.5829846897350541,-0.48770705144718485,-0.18421593378957746,-0.5007711700979987,0.23001304157909896,0.6033390574435555,0.9355700001983185,0,-0.9430109004673604,0,0.8836660550359177,0.1818513192646496,-0.2745377653558956,-0.8765604850666882,0,0,0.7680237002682309,-0.20775575352065362,0.3766893382951009,-0.7017017703623745,-0.10250516451968461,0.1661495527435528],[0.6174555820064043,-0.2766816887096551,0.4508506163712882,0,-0.5141484874065139,0,0.23081861820469834,0,0,-0.43592093793337283,0.6104655771581402,0.882025767438892,0.007610646759460105,0,-0.5305148690502002,0.7258108140747279,-0.30663442784155315,-0.35634892045555944,0,-0.5301506846580726,-0.805953010033488,0.41326063873472185,0.10935063114319726],[-0.42693815109702316,0.3513343517864904,1.907487207724889,0,0.7733137556284462,-0.15851652557313778,0.340709976846576,0,0.23497128635293857,0.18524900558103208,0.8345729493737633,0.01693342287367805,0.12405484210016776,0,0,-0.07890884309390267,-0.40296102548299473,0,-0.6080489252392155,0,0,0,0]],
    [[0,-0.39024376490615786,-0.047417936168025365,-0.6863556167626261,-0.002635770905024204,-0.5093601064856673,0.31476342600264884,0.785538830731954,0.8393844096231865,-1.145478073072645,-0.630025526857418,-0.1369000608079049,1.2702726175879342,-0.14926033321930976,0,0.27913163408441743,0.5176045746377933,0.5062894850925217,0.1889523733427625,-0.05002311344279231,0.2156459426692352,0.4065800043697707,0.9553633325410937],[0,-1.0597670174904432,-0.6459845666106041,0,0.39490221855487184,0.15089047052097904,0.7863564902909534,-0.7570882586159018,0.23175140100053992,0.8784804492140925,-0.5832780256618268,-0.07411108373127995,0.11648789612291177,-1.2353234378588684,-0.1118229366504464,-0.27388806351971656,0,-0.254500383989126,0.09375389567134595,0.5894693495266927,0.6120357501079337,0.7818147877854369,-0.006337634958287819],[0,0.702247954160215,-0.5648885248743878,0.2746390827321057,-0.052589752636393206,-0.3225202006603876,0.9108823992214521,0.21777125319644686,-0.2307084230226667,0.1654422236176014,0.8725123245992512,0,0.9510949979085266,0.412687120243008,-1.19063115910674,1.333731140313799,-0.4330855839365407,0,-0.36096436522303826,-0.9935075705063123,0,0.07923844962931592,0.5719621827771393],[0.019506513669839576,0,0.37626154568923065,0,-0.2725623867106111,0.9968272712924049,0.39525970066877025,0,0,0.05186840536689474,0.6980711701159913,1.775409830440969,-0.4733334084743471,-0.2913357446359004,0,-0.09242220528418876,-0.9341721750302784,0.9482667683636008,0,-0.04638714543413408,0.8671233533953326,1.1407384513227645,0.0156960440976619],[1.6936958706442242,1.4096350697142122,-0.08567315668373121,0.9172841945770536,0,2.259538718169252,0.098449335013435,0.6856867238743489,-0.6232007173111589,0.870775890670314,-0.29612697682424605,0.7220423661861872,-0.9283629591260274,0.42676516064042447,-0.8528686986890646,0.21617271113101522,-0.7798520661617425,0,-0.38524456188301354,1.833260107032172,0,-0.5626741467751262,0.5985326592006146]],
    [[0,-0.32542859874845115,-0.3686594980705474,0,-0.18658585316412596,0.36276058155818514,0.6006890765005437,0.6543016527068057,0.7648729315592144,0,-0.7514448202349842,0.936336465425843,0,0.01844719917523019,-1.2005682361676004,-0.18224763393641474,-0.14513366530753546,0,0,0,0.17349053241055767,0,-0.9608739224040932],[0,0,-0.47380214244621865,-0.09261237565038588,0,0.6778675965836436,0,0,0.8207368796788492,0.8194614748006155,0,0,0.6509505859631126,0,-0.431915186498184,0,-0.11674241917327532,0,0,0.22450371773946542,0,0.3192672977105582,0],[1.6511316818573551,0,-0.6809163810998493,0.670834542047416,0.38752018169078806,0,0.767242365995201,0.4577583120481967,0,-0.18714116456566376,0.8936631103463244,0.7021360385722627,-0.3459530919531496,0,0.9646552545688536,-0.9518884712566567,0,0,0,0,1.441997037152862,-0.09784460500459957,0],[0.8580432539109508,-0.4107990966347709,0.22721077627827135,0,0,-0.19886370561201305,-0.7330436452651554,-0.19243365774068444,0.5022124460565938,0.4564756039457951,0,0.7049537676174029,0,0,0.4734575138526069,0,0.9698353528183166,-0.7979041004422691,0,0,0.3041835363785741,0.3347223455764632,0],[1.418337668948014,1.4520636660480566,0,0.9386153608534107,0.8447720356068336,0.8929503171952984,0.7201180774118923,0.5303979936480938,-0.6685179869846056,0.5347278580079067,0.5849228049110595,0.4270255418180695,-0.38066131119627494,0,0.10147845392284494,0,0,0.09835102341344593,0,0,0.31861792159003743,0,0.3429267793724493]],
    [[0.8575200671890819,-0.5530935354834781,0,0,0,0.6032163403737505,-0.0524145210872643,1.2661469950767703,-0.41730446047683134,0.9475500610226635,0.02191121799313467,-0.4677720262249177,0.6575811962662828,1.975225049544225,-0.021018459079374274,0,-0.3445402788073382,0,0,0.9563980888345758,-0.4656949722326922,-0.800051114806674,0.568396143829138],[-0.2618939515814947,-0.917152632533248,0.16092763977878854,0,-0.5926064862170102,0.03171664419781717,0,-0.6504553208427859,1.0619442127210987,0,0,-0.3793384618641322,-0.23721364599568856,0.34921788126114284,0.35640958039689163,0,0.7141125451506336,-0.2911230951938877,-0.8561111074165808,-0.18323719765648083,0.9672780411375754,0,0.2648080272152613],[0.9425618631649706,1.0189747387466788,0,0.6472678985013551,0,0,0,1.3675761433204536,-0.12055231783205023,0,-0.3122569613447075,0.34420662269606983,-0.09728963041714955,-0.8415835579570077,0.24759795546903207,0.7976930225655916,-0.1941178830159973,-0.32437904927277916,-0.5851629641122922,-1.2089882904117406,-0.7029545193177957,0.35785791295382374,0.24064752615266793],[-0.034364857716938035,0,-0.27448613337700345,0.8614504940652494,0.42071057127496303,0,0.48741124219540244,0,0,-0.15735802836803447,-0.15760866565571652,0,0,0.3707705785332186,0.8295510274396316,0,-0.17136039023111221,0,0.6428756343468167,0.8843665367933868,0,0,0],[0.882382879199525,0.8869442444462317,0.45448453739618105,1.4575001372752308,0.8725416905886607,0.6071424629096169,-0.8889767858325266,-0.7017651427488467,-0.20781883984926863,0.4977044030342255,0.6801917988820749,0,0.773450028660291,-0.14087082411951035,0,0.6315934759638933,0.9158636636001933,-0.6493102195639464,0.47786627222735856,0.5361575822950448,0.9506361037406081,0.9132171824357609,0.13009139583506624]],
    [[-1.3221933987101018,-0.7406651691935435,0.02465295695096903,-0.5107760599734064,0,-0.1517050075181554,0.18304314924857157,0.33784663795351766,0.33523299432679243,0.003527088717838467,-1.055507023590565,0.507666401080453,0.2773888110787819,-0.9275218674714718,0.6599147658589135,0.9127158220997318,-0.6031607499076181,-0.1777024646615457,-0.5047454149840058,0.9242864321123108,-0.272537344560007,0.7843350165410647,-0.3890392924898054],[0.6260061484497901,-0.919788625029768,0.6039202439541385,-0.8307237382516257,-0.18505502630694992,0.004445668600413288,0.8414141615637245,-0.913207101026229,-0.11965368947332822,0.438217716870811,-0.8619145219873152,0.7517788365369311,-0.620157168397043,0.5061208169863909,0.8305311337906538,0.7684282874370838,0.7849053159778563,0.21073873515866604,0.3043445369145561,0.20784790715240997,-0.6306950706697092,0.6408830927902291,-0.675021464243855],[-0.7263925869989565,0.5005074944516594,-0.09038317912926774,-0.3130262828712256,-0.5797409551707107,-0.4247146159427684,0.7147826702856137,-0.039627446777372954,-0.7435691028567615,0.535492340906502,-0.7451428973148164,0,0.8094922295649067,0.8905577732203747,-0.48930059913829815,0.9989137013877127,0.2160789162337282,0.6741230705273276,0,0.2363253507426064,0.9021477812958898,0.46015659026146505,0.44541391371049466],[0.5742139626761376,-0.16891033001522882,0.9888070478057878,0,-0.8154389861644444,1.1054752182724892,-0.8572042603068117,0.470350777525004,0.3276498919727391,0.5643009645057682,0.8387031899547182,0.8380614822527197,0.7870369599589895,0.03365503424206784,0.731910212647831,0,-0.5511053959280408,0.14040644543440295,-0.4975825600717334,0.6854535560769066,0.7186641267833397,0.2385143090574986,0.3483268454295687],[0.23226755856304515,0.3757731420434134,-0.22126972136509898,0,-0.017115944926888282,0,-0.3822387587981666,0.8394798963028645,-0.8925380515052885,-0.033136184389396695,-0.8400837809836301,0.9333891677992399,-0.010941613656242799,-0.1412129913562692,-0.1656639420416246,1.2757649692200363,0.08939927240574486,1.2080680249109288,0.6077843479290068,-0.9681889189835675,-0.7431120257875998,-0.17607636240752034,-0.3498282504936354]],
    [[-0.5304881311998444,-0.36858592831512826,0,-0.9825379216712682,-0.24098951565468751,-0.13227764889499416,0,0,0,-0.8368682754856442,0,0.28368882301170273,0.14456523673758293,0.9261567832917426,-0.22367747413693784,0,0.907575217795858,-0.24236636356516583,0,0,0.6063019104358223,0.363050572674529,-0.3031227705551396],[0,-0.5211802592735086,0.8892283632065545,-0.965300924529062,0,0,-0.2044427518575329,-0.2440253082134496,0,-0.11011496798580178,0,0,0.07035637601051503,0,-0.47497933557753225,-0.18003974300584957,-0.28289747856699066,-0.9579818179369888,0,0,0,-0.41297182902508767,0.5845242004781919],[0.0728149061698542,0,-0.9205982241694679,0,0,0.990403639251475,-0.6805026203052127,-0.16497495160112385,0.4997623364488617,-0.5598105979931307,0,0,0,0,-0.7826265697837189,0,-0.6370092782938699,-0.5146704552181791,0,0,-0.31471664357725637,0,-0.7027815759969516],[1,0.556027045293445,0.6265422842426283,-0.5249274611436214,-0.9881778663409126,0.10135257742069759,-0.7952674055019171,-0.6371080189145994,0,0.49527943654107376,0,0.6744491811686708,0.4556603419314522,0,-0.4419052459490225,0.16881542939347183,0.5378060355369865,0,0,-0.6957716622852146,0,-0.644969779229172,0],[-0.2567133488457505,0,-0.9715778570936184,0,0.45964068974090977,0,0.22059820543125563,-0.9617118426887874,0,0,0.44120626110637096,0,0,-0.5702432476587664,0.78516236154986,0,-0.1038526881877706,0,-0.39492125324582994,-0.7217579845369773,0,0.46321298783443576,0.5770822113241854]],
]
class AimanRoom extends Room{
    constructor(name,parent){
        super(name,parent,{teamMode:false,maxPlayers:2,hidden:true,aiman:true});
        let id=Math.floor(Math.random()*AIs.length);
        this.game.joinPlayer(new _game.TaimanAi("名無しAI🤖"+id,this.game,AIs[id]));
        //this.game.joinPlayer(new _game.TaimanAi("名無しAI🤖",this.game,AIs));
    }
}
/*function resetGame(){
    recentLog=[];
    delete game;
    game=new _game.Game(_SKILLS_MOTO,_HP_DEFAULT,resetGame,log,showPlayers);
    Object.keys(io.sockets.connected).forEach(k=>{
        let socket=io.sockets.connected[k];
        let id="guest"+Math.floor(Math.random()*10000);
        socket.emit("reset",{"id":id});
        log("connected:"+id);
        game.joinPlayer(new Human(id,game,socket),false);
    });
    game.setStartnumber(game.startnumber);
}*/

function Human(nickname,team,game,socket){
    _game.Player.call(this,socket.id,nickname,team,game);
    this.socket=socket;
    this.isHuman=true;
    this.reqDecisionWrapped=function(callBack,candidates){
        this.socket.emit('input_action',{"candidates":candidates});
        this.onAction=function(data){
            callBack(this.game.genDecision(data.action));
        }.bind(this);
    }.bind(this);
    this.onAction=function(){};
    this.socket.on("action",function(data){
        this.onAction(data)
    }.bind(this));
    this.clearCommand=function(){
        this.socket.on("action",function(){});
        this.socket.emit("clear_command",{});
    }
}

function generateUuid() {
    // https://github.com/GoogleChrome/chrome-platform-analytics/blob/master/src/internal/identifier.js
    // const FORMAT: string = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    let chars = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".split("");
    for (let i = 0, len = chars.length; i < len; i++) {
        switch (chars[i]) {
            case "x":
                chars[i] = Math.floor(Math.random() * 16).toString(16);
                break;
            case "y":
                chars[i] = (Math.floor(Math.random() * 4) + 8).toString(16);
                break;
        }
    }
    return chars.join("");
}
