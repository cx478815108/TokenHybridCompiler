const fs = require('fs');
const ProjectConfigJSONPath = __dirname.replace("src","project.json");
if (!fs.existsSync(ProjectConfigJSONPath)) {
    throw '未配置工程文件，请在根目录下新建project.json 文件';
}

const Projects = {
    projects:{},
    currentProjectId:'',
    loadProjectInfo(){
        const ProductionPath = __dirname.replace('src', 'production/');
        if (!fs.existsSync(ProductionPath)) {
            fs.mkdirSync(ProductionPath);
        }

        // 读取配置文件
        const ProjectRootPath = ProjectConfigJSONPath.replace("project.json", "");
        const data = fs.readFileSync(ProjectConfigJSONPath);
        const configJSON = JSON.parse(data.toString());
        this.currentProjectId = configJSON.currentProject;
        // 生成一个对象
        for (let i = 0; i < configJSON.projects.length; i++) {
            const info = {};
            const item = configJSON.projects[i];
            info.zipName = item.exportZipName;
            info.entryHTMLName = item.EnteryHTMLName;
            info.projectFolderName = item.projectFolderName;
            info.version = item.version;
            info.projectFolderPath = __dirname.replace('src', info.projectFolderName + '/');
            info.entryHTMLPath = info.projectFolderPath + info.entryHTMLName;
            info.configJSONPath = info.projectFolderPath + 'config.json';
            info.productionPath = ProductionPath;
            const projectId = item.projectId;
            this.projects[projectId] = info;
        }
    },
    getProjectInfo(id){
        return this.projects[id];
    },
    getDefaultProjectInfo(){
        if(process.argv.length > 2){
            const projectID = process.argv[2];
            return this.projects[projectID];
        }
        return this.projects[this.currentProjectId];
    }
}
module.exports = Projects;