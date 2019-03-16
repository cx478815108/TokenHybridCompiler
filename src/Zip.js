const KeyMapper = {
    "uid":'u',
    "tagName":"tn",
    "text":'t',
    "attributes":'a',
    "textData":'ta',
    "dynamicAttrsData":"da",
    "layoutKey":'lk',
    "styleKey": 'sk',
    "isForNode":'in',
    "children":'c',
    "isDynamicText":'it',
    "component":'ct',
    "static" :"s",
    "bind":"b",
    "forKeyPath": "f",
    "clickInfo" : "ci",
    "id" : "i",
    "fontStyle":"fi"
}

class Node{
    constructor(json){
        for (const key in json) {
            if (key !== 'children'){
                this.setKeyValue(key, json[key]);
            }
            else {
                const children = json[key];
                if (children.length == 0) continue;
                this.c = [];
                for (let i = 0; i < children.length; i++) {
                    const element = children[i];
                    const node = new Node(element);
                    this.c.push(node);
                }
            }
        }

        if (json.forKeyPath) {
            this.f = json.forKeyPath.zip();
        }

        if (json.textData.length){
            let ta = [];
            for (let i = 0; i < json.textData.length; i++) {
                const textDataNode = json.textData[i];
                if (textDataNode.t === '1') {
                    ta.push({
                        t: textDataNode.t,
                        e: textDataNode.e.zip()
                    });
                } else {
                    ta.push(textDataNode);
                }
            }
            this.ta = ta;
        }

        if (Object.keys(json.dynamicAttrsData).length){
            const da = {};
            for (const key in json.dynamicAttrsData) {
                da[key] = json.dynamicAttrsData[key].zip();
            }
            this.da = da;
        }
    }

    setKeyValue(key,val){
        const mapKey = KeyMapper[key];
        if (!mapKey) return;
        if (typeof val === 'boolean' && val) {
            this[mapKey] = 1;
        }
        else if (typeof val === 'number' && val >= 0) {
            // number => string
            this[mapKey] = "" + val;
        }
        else if (typeof val === 'string' && val.length > 0) {
            this[mapKey] = val;
        }
        else if (typeof val === "object") {
            if (Array.isArray(val) && val.length > 0) {
               this[mapKey] = val;
            }
            else if (val && Object.keys(val).length > 0) {
                this[mapKey] = val;
            }
        }
    }
}

const Zip = (json)=>{
    const node = new Node(json);
    return node;
}

module.exports = Zip;