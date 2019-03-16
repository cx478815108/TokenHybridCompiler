Array.prototype.top = function () {
    const l = this.length;
    return l > 0 ? this[l - 1] : null;
}

const VarExtract = require("./VarExtract.js");

class TokenKeyPathNode{
    constructor(){
        this.name = '';
        this.type = TokenKeyPathNode.nodeTypeUnknown;
        this.next = null;
    }

    zip(){
        const o = {};
        o.n = this.name;
        o.t = this.type;
        if(this.next){
            o.nt = this.next.zip();
        }
        return o;
    }
}

let i = 0;
TokenKeyPathNode.nodeTypeObject       = i++;
TokenKeyPathNode.nodeTypeArray        = i++;
TokenKeyPathNode.nodeTypeArrayItem    = i++;
TokenKeyPathNode.nodeTypeItemSelf     = i++;
TokenKeyPathNode.nodeTypeFixedIndex   = i++;
TokenKeyPathNode.nodeTypeDynamicIndex = i++;
TokenKeyPathNode.nodeTypeUnknown      = i++;

class DOMAnalyse {
    constructor(){
        this.rootNode       = null;
        this.prefixStack    = [];
        this.dataStack      = [];
        this.loopIndexStack = [];
    }

    nodeWalker(xmlNode, nodeProcess) {
        //push栈操作
        this.pushStack(xmlNode);
        nodeProcess(xmlNode);
        xmlNode.children.forEach((childNode) => {
            this.nodeWalker(childNode, nodeProcess);
        });
        //pop栈操作
        this.popStack(xmlNode);
        if (xmlNode.tagName === 'table') {
            xmlNode.isForNode = false;
        }
    }

    start(){
        this.nodeWalker(this.rootNode,(xmlNode)=>{
            if (xmlNode.isForNode) {
                // 处理for循环语句的前缀
                xmlNode.forKeyPath = this.produceKeyPathText(xmlNode.forLoop.dataKey,true);
            }
            // 文理文本标签的文本
            this.processLabelText(xmlNode);
            
            //处理标签的 attributes
            this.processAttributes(xmlNode);
        });
    }
    
    processLabelText(xmlNode){
        //处理text
        if (!(xmlNode.text.includes("{{") && xmlNode.text.includes("}}"))) return;
        
        const varTextList = VarExtract.parse(xmlNode.text);
        const indexText   = this.loopIndexStack.top();
        varTextList.forEach((obj) => {

            // obj.type === 0 '这是{{list[0]}}' ['这是','list','0'] '这是'.type == 0
            if (obj.type === 1) {
                if (this.loopIndexStack.length && obj.text === indexText) {
                    xmlNode.textData.push({
                        t: "2", // 循环文本
                    });
                }
                else {
                    const keyPathNode = this.produceKeyPathText(obj.text);
                    xmlNode.textData.push({
                        t: "1", //'这是' 引用文本
                        e: keyPathNode //element
                    })
                }
            } else {
                xmlNode.textData.push({
                    t: "0", // 静态文本
                    e: obj.text //element
                })
            }
        });
    }

    processAttributes(xmlNode){
        //处理attributes
        for (const key in xmlNode.dynamicAttrs) {
            let element = xmlNode.dynamicAttrs[key];
            element = element.trim().replace("{{", "").replace("}}", "");
            const keyPathNode = this.produceKeyPathText(element);
            xmlNode.dynamicAttrsData[key] = keyPathNode;
        }
    }

    processPrefix(text, isForString) {
        const index = isForString ? this.prefixStack.length - 2 : this.prefixStack.length - 1
        const prefix = this.prefixStack[index] + '.';
        if (text.startsWith(prefix)) {
            const filterText = text.substr(prefix.length, text.length - prefix.length);
            return filterText;
        }
        return text;
    }

    produceKeyPathText(text, isForString) {
        const paths = this.processPrefix(text, isForString).split(".");
        const nodes = [];
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            if (path.endsWith("]") && path.includes('[')) {
                const list = path.split('[').map((v) => v.trim().replace("]", ""));
                const arrayName = list[0];
                const index = list[1];

                const arrayNode = new TokenKeyPathNode();
                arrayNode.type = TokenKeyPathNode.nodeTypeArray;
                arrayNode.name = arrayName;
                nodes.push(arrayNode);

                const indexedNode = new TokenKeyPathNode();
                indexedNode.name = index;
                //判断是不是循环的text  list[index]  text == 'index' ?
                const indexText = this.loopIndexStack.top();
                if (index === indexText) {
                    indexedNode.type = TokenKeyPathNode.nodeTypeDynamicIndex;
                } else {
                    const intValue = parseInt(index);
                    indexedNode.type = isNaN(intValue) ? TokenKeyPathNode.nodeTypeUnknown :
                        TokenKeyPathNode.nodeTypeFixedIndex
                }
                nodes.push(indexedNode);

            } else {
                const objectNode = new TokenKeyPathNode();
                objectNode.name = path;
                if (i !== paths.length - 1) {
                    objectNode.type = TokenKeyPathNode.nodeTypeObject;
                } else {
                    if(isForString){
                        objectNode.type = TokenKeyPathNode.nodeTypeArray;
                    }
                    else {
                        if (path === this.loopIndexStack.top()) {
                            objectNode.type = TokenKeyPathNode.nodeTypeDynamicIndex;
                        } else {
                            const itemSelfRefrence = `$${this.prefixStack.top()}`;
                            if (path === itemSelfRefrence){
                                objectNode.type = TokenKeyPathNode.nodeTypeItemSelf;
                            }
                            else {
                                objectNode.type = TokenKeyPathNode.nodeTypeObject;
                            }
                        }
                    }
                }
                nodes.push(objectNode);
            }
        }

        if (nodes.length === 0) return null;
        for (let i = 0; i < nodes.length; i++) {
            if (i === 0) continue;
            const previous = nodes[i - 1];
            const trail = nodes[i];
            previous.next = trail;
        }

        return nodes[0];
    }

    pushStack(xmlNode){
        if (xmlNode.bind && xmlNode.bind.length) {
            // 前缀入栈
            this.prefixStack.push(xmlNode.bind);
            this.dataStack.push(xmlNode.bind);
        }

        if(xmlNode.isForNode) {
            //去掉for循环的前缀
            this.prefixStack.push(xmlNode.forLoop.valueKey);

            this.loopIndexStack.push(xmlNode.forLoop.indexKey);
        }

        //设置 xmlNode的component
        xmlNode.component = this.dataStack.top();
    }

    popStack(xmlNode) {
        if (xmlNode.bind && xmlNode.bind.length) {
            // 前缀入栈
            this.prefixStack.pop();
            this.dataStack.pop();
        }

        if (xmlNode.isForNode) {
            this.prefixStack.pop();
        }
    }
}

module.exports = DOMAnalyse;