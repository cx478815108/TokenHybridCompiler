const http   = require('http').Server();
const io     = require('socket.io')(http);
const fs     = require('fs');
const os     = require('os');
const open   = require('open');
const net    = require('net');
const Upload = require('./Upload');
const Path   = require("path");

const WbSocketEventNameAction = 'Action';

class SocketMessage{
    constructor(){
        this.type    = 1;
        this.message = '';
        this.data    = null;
    }

    fillData(data,length){
        if(data.length < length){
          let r = Buffer.concat([data],data.length);
          const f = Buffer.from('|');
          for(let i = data.length; i < length;i ++){
            r = Buffer.concat([r,f],r.length + 1);
          }
          return r;
        }
        return data;
    }
      
    getBuff(){
        const bodyBuff = this.data;
        // 不足2字节补充'|'
        const n3 = Buffer.from(this.message); // message
        const totalLength = 5 + 1 + 2 + n3.length + bodyBuff.length;
        const n1 = this.fillData(Buffer.from('' + totalLength) ,5);
        const n2 = this.fillData(Buffer.from('' + n3.length) ,2);
        const typeBuff = Buffer.from(""+this.type);
        let r = Buffer.concat([n1,typeBuff,n2,n3,bodyBuff],totalLength);
        return r;
    }
}

SocketMessage.bionaryType = 0;
SocketMessage.otherType   = 1;

const SocketMessageMaker = (type,message,data) =>{
    const msg   = new SocketMessage();
    msg.type    = type;
    msg.message = message;
    if(type === SocketMessage.bionaryType){
        msg.data = data;
    }
    else {
        msg.data = Buffer.from(JSON.stringify(data));
    }
    return msg;
}

class Utils{
    constructor(){
        this.ipAddress = "";
        this.selectedUnqiqueName = "";
        this.selectedProjectName = "";
        this.configJSON = {};
    }
    
    getReloadAppNames(){
        this.reloadProjectJSON();
        const list = this.configJSON.debugReloadZipNames;
        return Array.isArray(list) ? list : [];
    }
    
    getCompileProjectNames() {
        this.reloadProjectJSON();
        const list = this.configJSON.debugCompileProjects;
        return Array.isArray(list) ? list : [];
    }

    getAppUniqueName(){
        if(this.selectedUnqiqueName.length){
            return this.selectedUnqiqueName;
        }
        this.reloadProjectJSON();

        const projectInfo = this.configJSON.projects[0];
        return projectInfo.exportZipName;
    }

    getIPAdress(){
        if (!this.ipAddress) {
            const interfaces = os.networkInterfaces();
            for (let devName in interfaces) {
                const iface = interfaces[devName];
                for (let i = 0; i < iface.length; i++) {
                    let alias = iface[i];
                    if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                        this.ipAddress = alias.address;
                        return this.ipAddress;
                    }
                }
            }
        }
        return this.ipAddress;
    }

    reloadProjectJSON(){
        const path = this.getConfigJSONPath();
        if (fs.existsSync(path)) {
            this.configJSON = JSON.parse(fs.readFileSync(path).toString());
        }
    }
    
    getConfigJSONPath(){
        const t = Path.sep;
        const r = Path.normalize(__dirname.replace(`${t}src${t}Debug`, "/project.json"));
        return r;
    }

    getCurrentZipPath(){
        let zipName = this.selectedUnqiqueName;
        if (!zipName.length) {
            this.reloadProjectJSON();
            zipName = this.configJSON.AppUniqueName;
        }
        const t = Path.sep;
        const r = Path.normalize(__dirname.replace(`${t}src${t}Debug`, `/production/${zipName}.zip`));
        return r;
    }

    compileSourceCode(finish){
        const spawn = require('child_process').spawn;
        const t = Path.sep;
        const path = __dirname.replace(`${t}Debug`, "/main.js");

        const child = spawn("node", [path, this.selectedProjectName], {
            stdio: ['pipe']
        });
        let log = '';
        if (child.stdout !== null) {
            child.stdout.on('data', function (data) {
                log += data.toString();
            });
        } else {
            log += child.stdout;
        }
        child.on('exit', function (err) {
            if (finish) {
                finish(log);
            }
        });
    }

    reloadZip(process){
        if (!debug.mobileSocket || !debug.mobileConnected){
            if(process){
                process("iPhone 未连接");
            }
            return ;
        }
    
        const path = this.getCurrentZipPath();

        if(process){
            process("开始传输文件\n" + path);
        }

        const rs = fs.createReadStream(path, {
            highWaterMark: 65528
        })

        const self = this;
        rs.on('data', function (chunk) {
            const name = self.getAppUniqueName();
            const message = SocketMessageMaker(0,name,chunk);
            const buff    = message.getBuff();
            debug.mobileSocket.write(buff);
        });
    
        rs.on('end', function (chunk) {
            const name = self.getAppUniqueName();
            const message = SocketMessageMaker(1,name,{"msg":"传送完毕"});
            const buff    = message.getBuff();
            debug.mobileSocket.write(buff);
            if(process){
                process("传送完毕\n" + path);
            }
        });
    
        // 监听错误
        rs.on('error', function (err) {
            const name = self.getAppUniqueName();
            const message = SocketMessageMaker(1,name,{"msg":"传送发生错误"});
            const buff    = message.getBuff();
            debug.mobileSocket.write(buff);
            if(process){
                process("传送发生错误");
            }
        });
    }
}

const utils = new Utils();
console.log('当前IP地址：'+utils.getIPAdress());

class Debug{
    constructor(){
        this.htmlOpend     = false;
        this.wbSocket      = null;
        this.mobileSocket  = null;
        this.developerPort = 8011;
        this.mobilePort    = 8012;
        this.address       = '127.0.0.1';
        this.mobileConnected = false;
        this.webConnected = false;
        this.uploading = false;
    }

    alertWeb(text){
        if(this.wbSocket){
            this.wbSocket.emit('alert',text);
        }
    }

    didReceiveWebMessage(info){
        utils.selectedUnqiqueName = info.zipName;
        utils.selectedProjectName = info.projectName;
        const self = this;
        if(info.actionCode == 2019){
            console.log("收到命令：执行脚本");
            if(debug.mobileSocket && this.mobileConnected){
                //script
                const name = utils.getAppUniqueName();
                const MobileMessageRunScriptType = 3;
                const message = SocketMessageMaker(MobileMessageRunScriptType,
                                                    name,
                                                    {"script":info.script});
                const buff    = message.getBuff();
                debug.mobileSocket.write(buff);
            }
            else {
                console.log("手机未连接");
            }
        }
        else if(info.actionCode == 2010){
            console.log("收到命令：重载zip包");
            utils.reloadZip((log)=>{
                self.sendWebInformation(log);
            });
        }
        else if(info.actionCode == 2011){
            console.log("收到命令：编译文件");
            utils.compileSourceCode((log)=>{
                self.sendWebInformation(log);
            });
        }
        else if(info.actionCode == 2012){
            console.log("收到命令：改变当前App的名字");
            if(debug.mobileSocket && this.mobileConnected){
                const name    = utils.selectedUnqiqueName;
                const MobileMessageChangeNameType = 2;
                const message = SocketMessageMaker(MobileMessageChangeNameType,
                                                    name,
                                                    {'info':`当前App变更为${name}.zip`});
                const buff    = message.getBuff();
                debug.mobileSocket.write(buff);
            }
            else {
                console.log("手机未连接");
            }
        }
        else if(info.actionCode == 2013){
            console.log("收到命令：刷新App");
            const name    = utils.selectedUnqiqueName;
            const MobileMessageChangeNameType = 4;
            const message = SocketMessageMaker(MobileMessageChangeNameType,
                                                name,
                                                {'info':`刷新App为${name}`});
            const buff    = message.getBuff();
            debug.mobileSocket.write(buff);
        }
        else if(info.actionCode == 2014){
            if(this.uploading){
                return;
            }
            this.uploading = true;
            const name     = utils.getAppUniqueName();
            const upload   = new Upload();
            upload.uploadZipWithName(name)
            .then((log)=>{
                this.alertWeb('上传成功');
                this.uploading = false;
                this.sendWebInformation(log);
            })
            .catch((err)=>{
                this.alertWeb('上传失败');
                this.uploading = false;
                console.log("上传失败",err);
            });
        }
    }

    handleMobileMessage(buffData){
        console.log("接收到手机消息",buffData.toString());
        try {
            const data = JSON.parse(buffData.toString());
            if(data.identify === 'iOS'){
                console.log("iOS客户端已经连接");
                this.alertWeb('iOS客户端已经连接');
                this.mobileConnected = true;
                this.sendWebInformation("","");
            }

            if(data.evalLog){
                this.sendWebInformation("",data.evalLog);
            }

            if(this.mobileConnected){
                if (data.log) {
                    this.sendWebInformation(data.log);
                }
            }
        } catch (error) {
            console.log(buffData.toString());
        }
    }

    sendWebStatusInformation(){
        if(!this.wbSocket){
            return ;
        }

        const info = {};
        // 手机状态
        info.mobileConnect  = this.mobileConnected;
        info.ipAddress      = utils.getIPAdress();
        info.reloadZipNames = utils.getReloadAppNames();
        info.projectNames   = utils.getCompileProjectNames();
        this.wbSocket.emit('information',info);
    }

    sendWebInformation(textLog,scriptLog){
        if(!this.wbSocket){
            return ;
        }

        const info = {};
        // 手机状态
        info.mobileConnect  = this.mobileConnected;
        info.ipAddress      = utils.getIPAdress();
        info.reloadZipNames = utils.getReloadAppNames();
        info.projectNames   = utils.getCompileProjectNames();
        info.textLog        = textLog ? textLog : "";
        info.scriptLog      = scriptLog ? scriptLog : "";
        this.wbSocket.emit('information',info);
    }

    startWebSocket(){
        const self = this;
        io.on('connection', function (socket) {
            if (!self.webConnected) {
                console.log("web已经连接");
            }
            
            self.webConnected = true;
            self.wbSocket     = socket;
            self.sendWebInformation();

            socket.on(WbSocketEventNameAction,function(info){
                self.didReceiveWebMessage(info);
            });
        });
        
        const port = this.developerPort;
        http.listen(port,this.address ,function () {
            console.log('开始监听调试工具端口 *:' + port);
            if(!this.htmlOpend){
                this.htmlOpend = true;
                open(__dirname + '/html/index.html');
            }
        });
    }

    startMobileSocket(){
        const self = this;
        const server = net.createServer(function(socket){
            console.log("收到手机端连接");
        
            self.mobileSocket    = socket;
            self.sendWebInformation("","");
      
            //接收到数据
            socket.on('data',function(data){
                self.sendWebStatusInformation();
                self.handleMobileMessage(data);
            });
        
            //数据错误事件
            socket.on('error',function(exception){
                console.log('发生数据错误' + exception);
                socket.end();
                self.mobileConnected = false;
                self.sendWebStatusInformation();
            });
          
            //客户端关闭事件
            socket.on('close',function(data){
                self.mobileConnected = false;
                self.sendWebInformation("手机端连接丢失");
                self.alertWeb('iOS客户端连接丢失');
            });
        });

        server.listen(this.mobilePort,utils.getIPAdress(),function(){
            console.log("开始监听手机端");
        });

        // 服务器错误事件
        server.on("error",function(exception){
            console.log("手机TCP服务错误",exception);
            server.close();
            self.mobileConnected = false;
            self.sendWebInformation("TCP服务错误");
        });
    }
}

const debug = new Debug();
debug.startWebSocket();
debug.startMobileSocket();