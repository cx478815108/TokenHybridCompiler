const path = require('path');
const fs = require('fs');

class ProjectUtil{
    
    srcFolderPath(){
        return path.resolve('./');
    }

    mainJSPath(){
        const t = path.resolve('./');
        return path.join(t, 'src' ,'main.js');
    }

    productionPath(){
        const t = path.resolve('./');
        return path.join(t,'production');
    }

    appsPath(){
        const t = path.resolve('./');
        return path.join(t,'apps');
    }

    appFolderNames(){
        const components = []
        const appsPath = this.appsPath();
        const files = fs.readdirSync(appsPath);
        files.forEach(function (item, index) {
            let state = fs.statSync(path.join(appsPath,item));
            if(state.isDirectory() === true) {
                components.push(item);
            }
        });
        return components;
    }

    appConfigJSONPaths(){
        const list = this.appFolderNames();
        const appsPath = this.appsPath();
        const paths = list.map((v)=>{
            return path.join(appsPath,v,'config.json');
        });
        return paths;
    }
}

const util = new ProjectUtil();
class ProjectInfos{
    constructor(){
        this.projects = {};
        this.defaultProjectInfo = null;
        this.projectNames = [];
        this.projectFolderPaths = [];
        this.loadProjects();
        this.mainJSPath = util.mainJSPath();
    }

    getDefaultProjectInfo(){
        this.defaultProjectInfo = null;
        this.loadProjects();
        const projectName = this.projectNames[0];
        this.defaultProjectInfo = this.projects[projectName];
        return this.defaultProjectInfo;
    }

    loadProjects(){
        this.projectNames = [];
        const folderPaths = util.appFolderNames();
        const appsPath = util.appsPath();
        const projects = {};
        const productionPath = util.productionPath();
        folderPaths.forEach((v)=>{
            const jsonPath = path.join(appsPath,v,'config.json');
            const t = fs.readFileSync(jsonPath).toString();
            const j = JSON.parse(t);
            j.entryJS  = j.entryJS || 'index.js';

            const i = {};
            i.entryHTMLPath = path.join(appsPath, v, 'index.html');
            i.exportZipName = j.exportZipName;
            i.configJSON    = j;
            i.projectFolderName = v;
            i.projectFolderPath = path.join(appsPath,v);
            i.productionFolderPath = path.join(productionPath,v);
            i.configJSONSavePath   = path.join(productionPath, v, 'config.json'); 
            i.entryJSPath = path.join(appsPath,v,j.entryJS);
            i.rootProductionPath = util.productionPath();
            i.uploadZipPath = path.join(productionPath,v,j.exportZipName+'.zip');
            i.productionJSONPath = path.join(productionPath, v, 'production.json');

            // v 是目录名字
            projects[v] = i;

            // 添加目录名
            this.projectNames.push(v);

            this.projectFolderPaths.push(i.projectFolderPath);
        });
        this.projects = projects;
        return projects;
    }
}

module.exports = ProjectInfos;