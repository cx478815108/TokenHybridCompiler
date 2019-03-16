const OSS      = require('ali-oss');
const fs       = require('fs');
const Crypto   = require('crypto');
const Projects = require('../Projects');

class Upload{
    constructor(){
        this.client = new OSS({
            region: 'oss-cn-beijing',
            accessKeyId: 'LTAIHs696atpAzxl',
            accessKeySecret: 'O2saNzQ9g7tsrXGq9mgdHwJ7OO2alO',
            bucket: 'tokendynamicapp'
        });

        this.productionPath = __dirname.replace("src/Debug","production/");
        this.compileToolPath = __dirname.replace("src/Debug","src/main.js");
        this.md5 = this.fetchTargetMD5();
        this.appsJSON = null;
    }
    
    compileCode(zipName){

        Projects.loadProjectInfo();
        const targetProject = Projects.projects[zipName];
        const folderName = targetProject.projectFolderName;

        return new Promise((resolve,rejects)=>{
            const spawn = require('child_process').spawn;
            const path = this.compileToolPath;
    
            const child = spawn("node", [path, folderName], {
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
                //编译成功
                if(log.includes('zip包输出至:')){
                    resolve(log);
                }
                else {
                    rejects(err);
                }
            }); 
        });
    }

    fetchTargetMD5(){
        const jsonPath = this.productionPath + 'production.json';
        const jsonText = fs.readFileSync(jsonPath).toString();
        return JSON.parse(jsonText).md5;
    }

    fetchAppsJSON(){
        return new Promise((resolve,rejects)=>{
            this.client.get('apps/apps.json')
            .then((response)=>{
                const s = response.content.toString();
                this.appsJSON = JSON.parse(s);
                resolve(this.appsJSON);
            })
            .catch((err)=>{
                rejects(err);
            });
        });
    }

    uploadZipFile(zipName){
        //上传zip 文件
        const zipFilePath = this.productionPath + zipName + '.zip';
        const zipDestnationPath = `apps/${zipName}/${zipName}.zip`;
        const zipPromise = this.client.putStream(zipDestnationPath, fs.createReadStream(zipFilePath));

        const md5DestnationPath = `apps/${zipName}/${zipName}.txt`;
        const md5Buffer = Buffer.from(this.md5);
        const md5Promise = this.client.put(md5DestnationPath,md5Buffer);

        return Promise.all([zipPromise,md5Promise]);
    }

    updateJSON(zipName,json){
        json[zipName] = {
            md5 : this.md5,
            uniqueName:zipName
        };

        // 上传项目的编译信息
        const jsonDestnationPath = `apps/apps.json`;
        const jsonString  = JSON.stringify(json);
        const buffer      = Buffer.from(jsonString);
        const jsonPromise =  this.client.put(jsonDestnationPath,buffer);
        return jsonPromise;
    }

    uploadZipWithName(zipName){
        let compileLog = "";
        return new Promise((resolve,rejects)=>{
            // 开始编译
            this.compileCode(zipName)
            .then((log)=>{
                compileLog = log;
                // 获取云端列表
                return this.fetchAppsJSON();
            })
            .then((json)=>{
                // 上传zip
                return this.uploadZipFile(zipName);
            })
            .then((wrapperObj)=>{
                // 更新云端App列表
                return this.updateJSON(zipName,this.appsJSON);
            })
            .then((results)=>{
                resolve(compileLog);
            })
            .catch((err)=>{
                rejects(err);
            });
        });
    }
}

module.exports = Upload;