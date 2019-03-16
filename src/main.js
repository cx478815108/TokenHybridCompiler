const fs           = require('fs');
const os           = require('os');
const HTMLDocument = require("./DOM/HTMLDocument");
const Util         = require("./DOM/Util");
const CommonStore  = require('./CommonStore');
const DOMAnalyse   = require('./DOMAnalyse');
const Zip          = require('./Zip');
const JSZip        = require('JSZip');
const Projects     = require('./Projects');
const Crypto = require('crypto');

const md5Sign = function (data) {
    var md5 = Crypto.createHash('md5').update(data).digest('hex');
    return md5;
}

Projects.loadProjectInfo();

class Compiler {
    constructor(){
        this.mainDocument = null;
        this.styleStore  = new CommonStore();
        this.layoutStore = new CommonStore();
    }

    buildMainNode() {
        console.log("⏳⏳⏳开始编译");
        const projectInfo = Projects.getDefaultProjectInfo();
        console.log("当前编译目标",projectInfo);
        const mainNodeText = this.loadTextFile(projectInfo.entryHTMLPath);
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

        const productionJSONmd5 = md5Sign(data.toString());
        
        const projectInfo = Projects.getDefaultProjectInfo();
        
        //保存config.json
        const configJSONPath = projectInfo.configJSONPath;
        const configJSON = fs.readFileSync(configJSONPath).toString();
        fs.writeFileSync(projectInfo.productionPath + '/config.json', configJSON);

        const configJSONMD5 = md5Sign(configJSON);

        // 将所有的js 文件保存到 production 文件夹下
        const jsPath = projectInfo.projectFolderPath;
        const jsFiles = this.produceModulesInfo(jsPath).filter((v)=>{
            return v.endsWith('.js');
        }).filter((v)=>{
            return !v.endsWith('test.js');
        });

        let jsFilesMD5 = "";
        const jsData = {};
        jsFiles.forEach((t)=>{
            const components = t.split('/');
            const fileName = components[components.length - 1];
            const content = fs.readFileSync(t).toString();
            const outputPath = `${projectInfo.productionPath}${fileName}`;
            fs.writeFileSync(outputPath,content);
            jsData[fileName] = content;
            jsFilesMD5 = jsFilesMD5 + md5Sign(content);
        });

        console.log("🍺🍺🍺保存至production完毕");

        var zip = new JSZip();
        zip.file('config.json', configJSON);
        
        let keys = Object.keys(jsData);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const content = jsData[key];
            // zip 添加所有的js 文件
            zip.file(key, content);
        }
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
            fs.writeFileSync(projectInfo.productionPath + '/production.json', JSON.stringify(newProductionJSON));

            const destinationPath = `${projectInfo.productionPath}${projectInfo.zipName}.zip`;
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
        const projectInfo = Projects.getDefaultProjectInfo();
        const modulePaths = this.produceModulesInfo(projectInfo.projectFolderPath);
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

    produceModulesInfo(path) {
        let r = [];
        fs.readdirSync(path).map((v) => {
            return path + '/' + v;
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
            const start = v.lastIndexOf('/');
            const fileName = v.substr(start + 1, v.length - start).split('.')[0];
            const module = {
                fileName
            };
            module.path = v;
            if (v.endsWith('.css')) {
                r.cssModule.push(module);
            }
            if (v.endsWith('.html')) {
                if (v !== this.entryPath) {
                    r.htmlModule.push(module);
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