const OSS      = require('ali-oss');
const fs       = require('fs');
const Crypto   = require('crypto');
const ProjectUtil = require('../ProjectUtil');

class Upload{
    constructor(){
        this.client = new OSS({
            region: 'oss-cn-beijing',
            accessKeyId: 'LTAIHs696atpAzxl',
            accessKeySecret: 'O2saNzQ9g7tsrXGq9mgdHwJ7OO2alO',
            bucket: 'tokendynamicapp'
        });
        this.projectUtil = new ProjectUtil();
        this.appsJSON = null;
        this.md5 = '';
        this.zipName = '';
    }
    
    compileCode(projectName){

        const targetProject = this.projectUtil.projects[projectName];
        const folderName = targetProject.projectFolderName;
        this.md5 = this.fetchTargetMD5(projectName);
        this.zipName = targetProject.exportZipName;
        
        return new Promise((resolve,rejects)=>{
            const spawn = require('child_process').spawn;
            const path = this.projectUtil.mainJSPath;
    
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

    fetchTargetMD5(projectName){
        const targetProject = this.projectUtil.projects[projectName];
        const jsonPath = targetProject.productionJSONPath;
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

    uploadZipFile(projectName){
        // 上传zip 文件
        const targetProject = this.projectUtil.projects[projectName];
        const zipName = targetProject.exportZipName;
        const zipFilePath = targetProject.uploadZipPath;
        const zipDestnationPath = `apps/${zipName}/${zipName}.zip`;
        const zipPromise = this.client.putStream(zipDestnationPath,         
                                            fs.createReadStream(zipFilePath));

        const md5DestnationPath = `apps/${zipName}/${zipName}.txt`;
        const md5Buffer = Buffer.from(this.md5);
        const md5Promise = this.client.put(md5DestnationPath,md5Buffer);

        return Promise.all([zipPromise,md5Promise]);
    }

    updateJSON(json){
        json[this.zipName] = {
            md5 : this.md5,
            uniqueName:this.zipName
        };

        // 上传项目的编译信息
        const jsonDestnationPath = `apps/apps.json`;
        const jsonString  = JSON.stringify(json);
        const buffer      = Buffer.from(jsonString);
        const jsonPromise =  this.client.put(jsonDestnationPath,buffer);
        return jsonPromise;
    }

    uploadProject(projectName){
        let compileLog = "";
        return new Promise((resolve,rejects)=>{
            // 开始编译
            this.compileCode(projectName)
            .then((log)=>{
                compileLog = log;
                // 获取云端列表
                return this.fetchAppsJSON();
            })
            .then((json)=>{
                // 上传zip
                return this.uploadZipFile(projectName);
            })
            .then((wrapperObj)=>{
                // 更新云端App列表
                return this.updateJSON(this.appsJSON);
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