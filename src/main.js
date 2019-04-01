const fs           = require('fs');
const os           = require('os');
const HTMLDocument = require("./DOM/HTMLDocument");
const Util         = require("./DOM/Util");
const CommonStore  = require('./CommonStore');
const DOMAnalyse   = require('./DOMAnalyse');
const Zip          = require('./Zip');
const JSZip        = require('JSZip');
const ProjectUtil  = require('./ProjectUtil');
const Path         = require("path");
const Crypto       = require('crypto');
const Terser       = require("Terser");

const md5Sign = function (data) {
    var md5 = Crypto.createHash('md5').update(data).digest('hex');
    return md5;
}

const Project = new ProjectUtil();

class Compiler {
    constructor(){
        this.mainDocument = null;
        this.styleStore   = new CommonStore();
        this.layoutStore  = new CommonStore();
        this.projectInfo  = Project.getDefaultProjectInfo();
        this.shouldZip    = false;

        if(process.argv.length > 2){
            const name = process.argv[2];
            this.projectInfo = Project.projects[name];
        }

        if(process.argv.length > 3){
            const configString = process.argv[3];
            const config = JSON.parse(configString);
            this.shouldZip = config.zipJS;
        }

        if(!fs.existsSync(this.projectInfo.rootProductionPath)){
            fs.mkdirSync(this.projectInfo.rootProductionPath);
        }

        const outputPath = this.projectInfo.productionFolderPath;
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath);
        }
    }

    buildMainNode() {
        console.log("⏳⏳⏳开始编译");
        console.log("当前编译路径\n",this.projectInfo.projectFolderPath);
        const mainNodeText = this.loadTextFile(this.projectInfo.entryHTMLPath);
        this.mainDocument = new HTMLDocument();
        this.mainDocument.creat(mainNodeText);
        this.mergeModules();
        this.processNode(this.mainDocument.rootNode);
    }

    processNode(rootNode){
        // 分离 layout 和style
        rootNode.makeSeporate();
        //解除循环
        rootNode.broken();

        //压缩layout 和style
        this.nodeWalker(rootNode,(node)=>{
            if (Object.keys(node.layout).length) {
                node.layoutKey = this.layoutStore.store(node.layout);
                delete(node.layout);
            }
            if (Object.keys(node.style).length) {
                node.styleKey = this.styleStore.store(node.style);
                delete(node.style);
            }
        });

        const domAnalyse = new DOMAnalyse();
        domAnalyse.rootNode = rootNode;
        domAnalyse.start();

        const data = {
            rootNode:Zip(rootNode),
            layoutStore: this.layoutStore.getJSONObj(),
            styleStore: this.styleStore.getJSONObj()
        };
        
        console.log('✅✅✅编译完成 开始保存');
        this.saveProduction(data);
    }

    nodeWalker(xmlNode, func) {
        func(xmlNode);
        xmlNode.children.forEach((childNode) => {
            this.nodeWalker(childNode, func);
        });
    }

    saveProduction(data) {
        const productionJSONmd5 = md5Sign(JSON.stringify(data));
        const projectInfo = this.projectInfo;
        
        //保存config.json
        const configJSON = JSON.stringify(projectInfo.configJSON);
        fs.writeFileSync(projectInfo.configJSONSavePath, configJSON);

        const configJSONMD5 = md5Sign(configJSON);

        // 将所有的js 文件保存到 production 文件夹下
        const jsPath = projectInfo.projectFolderPath;
        let jsFiles = this.produceModulesInfo(jsPath).filter((v)=>{
            return v.endsWith('.js') && v !== projectInfo.entryJSPath;
        });
        // 保证enteryJS 首先被执行
        jsFiles = [projectInfo.entryJSPath,...jsFiles];
        
        let zipScript = ''
        jsFiles.forEach((t)=>{
            const fileName = Path.basename(t,".js") + ".js";
            const content = fs.readFileSync(t).toString();
            // 合并所有的脚本
            zipScript += content;
        });

        if(this.shouldZip){
            zipScript = Terser.minify(zipScript).code;
        }

        const jsFilesMD5 = md5Sign(zipScript);
        const outputPath = Path.join(projectInfo.productionFolderPath,'main.js')
        fs.writeFileSync(outputPath,zipScript);

        console.log("🍺🍺🍺保存至production完毕");

        var zip = new JSZip();
        zip.file('config.json', configJSON);
        zip.file('main.js', zipScript);
        // zip 添加production.json
        zip.file('production.json', JSON.stringify(data));
        // 归档
        zip.generateAsync({
            type: "nodebuffer"
        }).then(function (content) {

            const newProductionJSON = JSON.parse(JSON.stringify(data));
            const allMD5 = productionJSONmd5 + configJSONMD5 + jsFilesMD5;
            const targetMD5 = md5Sign(allMD5);
            newProductionJSON['md5'] = targetMD5;

            // 保存production.json
            const targetPath = projectInfo.productionJSONPath;
            fs.writeFileSync(targetPath, JSON.stringify(newProductionJSON));

            const destinationPath = Path.join(projectInfo.productionFolderPath,projectInfo.exportZipName+'.zip');
            fs.writeFile(destinationPath, content, function (err) {
                if (err) {
                    console.log('zip包输出失败');
                }
                else{
                    console.log("zip包输出至:\n", destinationPath);
                    console.log("本次文件MD5:",targetMD5);
                }
            });
        });
    }

    mergeModules() {
        const modulePaths = this.produceModulesInfo(this.projectInfo.projectFolderPath);
        const modulesInfo = this.sortModulePaths(modulePaths);

        modulesInfo.cssModule.forEach((info) => {
            this.mergeCSS(info);
        });
    }

    mergeCSS(moduleInfo) {
        const cssText = this.loadTextFile(moduleInfo.path);
        const result = Util.parseCSSString(cssText);
        for (const selectors in result) {
            const rules = result[selectors];
            const selectorList = selectors.split(" ");
            selectorList.forEach((selector) => {
                // 根据 selector 寻找匹配的nodes 
                const nodes = this.mainDocument.findAll(selector);
                // nodes 将css rules合并进去
                nodes.forEach((node) => {
                    node.addStyle(rules);
                });
            });
        }
    }

    produceModulesInfo(filePath) {
        let r = [];
        fs.readdirSync(filePath).map((v) => {
            return Path.join(filePath,v);
        }).forEach((subPath) => {
            if (fs.lstatSync(subPath).isDirectory()) {
                r = r.concat(this.produceModulesInfo(subPath));
            } else {
                r.push(subPath);
            }
        });
        return r;
    }

    sortModulePaths(list) {
        const r = {
            cssModule: [],
            htmlModule: []
        };
        list.forEach((v) => {
            const fileName = Path.basename(v).split('.')[0];
            const modules = {
                fileName
            };
            modules.path = v;
            if (v.endsWith('.css')) {
                r.cssModule.push(modules);
            }
            if (v.endsWith('.html')) {
                if (v !== this.projectInfo.entryHTMLPath) {
                    r.htmlModule.push(modules);
                }
            }
        });
        return r;
    }

    loadTextFile(path) {
        return fs.readFileSync(path).toString();
    }
}

const compiler = new Compiler();
compiler.buildMainNode();