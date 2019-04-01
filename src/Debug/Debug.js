const http   = require('http').Server();
const io     = require('socket.io')(http);
const fs     = require('fs');
const os     = require('os');
const open   = require('open');
const net    = require('net');
const Upload = require('./Upload');
const ProjectUtil = require('../ProjectUtil');

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
        this.projectUtil = new ProjectUtil();
    }

    getCompileProjectNames(){
        return this.projectUtil.projectNames;
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

    compileSourceCode(projectName, opinion, finish){
        const spawn = require('child_process').spawn;
        const mainJSPath = this.projectUtil.mainJSPath;
        const config = opinion ? JSON.stringify(opinion) : '{}';
        const child = spawn("node", [mainJSPath, projectName, config], {
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
            if(err){
                finish(JSON.stringify(err));
            }
        });
    }

    reloadZip(projectName, process){
        if (!debug.mobileSocket || !debug.mobileConnected){
            if(process){
                process("iPhone 未连接");
            }
            return ;
        }

        this.projectUtil.loadProjects();
        const targetProject = this.projectUtil.projects[projectName];
        const zipName = targetProject.exportZipName;
    
        const uploadPath = targetProject.uploadZipPath;

        if(process){
            process("开始传输文件\n" + uploadPath);
        }

        const rs = fs.createReadStream(uploadPath, {
            highWaterMark: 65528
        })

        rs.on('data', function (chunk) {
            const message = SocketMessageMaker(0,zipName,chunk);
            const buff    = message.getBuff();
            debug.mobileSocket.write(buff);
        });
    
        rs.on('end', function (chunk) {
            const message = SocketMessageMaker(1,zipName,{"msg":"传送完毕"});
            const buff    = message.getBuff();
            debug.mobileSocket.write(buff);
            if(process){
                process("传送完毕\n" + uploadPath);
            }
        });
    
        // 监听错误
        rs.on('error', function (err) {
            const message = SocketMessageMaker(1,zipName,{"msg":"传送发生错误"});
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
        this.projectUtil = new ProjectUtil();
    }

    alertWeb(text){
        if(this.wbSocket){
            this.wbSocket.emit('alert',text);
        }
    }

    getProjectInfo(projectName){
        this.projectUtil.loadProjects();
        return this.projectUtil.projects[projectName];
    }

    didReceiveWebMessage(info){
        const targetProject = this.getProjectInfo(info.projectName);
        const self = this;
        if(info.actionCode == 2019){
            console.log("收到命令：执行脚本");
            if(debug.mobileSocket && this.mobileConnected){
                //script
                const MobileMessageRunScriptType = 3;
                const message = SocketMessageMaker(MobileMessageRunScriptType,
                                                    targetProject.exportZipName,
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
            utils.reloadZip(info.projectName, (log)=>{
                self.sendWebInformation(log);
            });
        }
        else if(info.actionCode == 2011){
            console.log("收到命令：编译文件");
            utils.compileSourceCode(info.projectName, info.compileOpinion, (log)=>{
                self.sendWebInformation(log);
            });
        }
        else if(info.actionCode == 2013){
            console.log("收到命令：刷新App");
            const MobileMessageChangeNameType = 4;
            const name = targetProject.exportZipName;
            const message = SocketMessageMaker(MobileMessageChangeNameType,name,
                                                {'info':`刷新App为${name}`});
            const buff    = message.getBuff();
            debug.mobileSocket.write(buff);
        }
        else if(info.actionCode == 2014){
            if(this.uploading){
                return;
            }
            this.uploading = true;
            const upload   = new Upload();
            upload.uploadProject(info.projectName)
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
        info.projectNames   = utils.getCompileProjectNames();
        info.projectFolderPaths = this.projectUtil.projectFolderPaths;
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
        info.projectNames   = utils.getCompileProjectNames();
        info.textLog        = textLog ? textLog : "";
        info.scriptLog      = scriptLog ? scriptLog : "";
        info.projectFolderPaths = this.projectUtil.projectFolderPaths;
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