const Util = require("./Util");
const VarExtract = require("../VarExtract");
const md5 = require("blueimp-md5");

const FlexValues = {
    "flex-wrap": true,
    "align-content": true,
    "align-items": true,
    "align-self": true,
    "justify-content": true,
    "direction": true,
    "flex-direction": true,
    "overflow": true,
    "position": true,
    "display": true,

    // float
    "flex": true,
    "flex-grow": true,
    "flex-shrink": true,
    "flex-basis": true,
    "aspectRatio": true,

    // percent float
    "width": true,
    "height": true,
    "left": true,
    "right": true,
    "top": true,
    "bottom": true,
    "start": true,
    "end": true,

    "max-width": true,
    "max-height": true,
    "min-width": true,
    "min-height": true,

    "margin": true,
    "margin-left": true,
    "margin-right": true,
    "margin-start": true,
    "margin-end": true,
    "margin-top": true,
    "margin-bottom": true,
    "margin-horizontal": true,
    "margin-vertical": true,

    "padding": true,
    "padding-left": true,
    "padding-right": true,
    "padding-start": true,
    "padding-end": true,
    "padding-top": true,
    "padding-bottom": true,
    "padding-horizontal": true,
    "padding-vertical": true,
}

let uid = 0;
const UniqueIdAlloc = ()=>{
    return uid++;
}

const TokenInstructions = {
    bind     : "@bind",
    tableData: "t:data",
    for      : "t:for"
}

const TokenViewModeMap = {
    "scaleToFill"    : 0,
    "scaleAspectFit" : 1,
    "scaleAspectFill": 2,
    "redraw"         : 3,
    "center"         : 4,
    "top"            : 5,
    "bottom"         : 6,
    "left"           : 7,
    "right"          : 8,
    "topLeft"        : 9,
    "topRight"       : 10,
    "bottomLeft"     : 11,
    "bottomRight"    : 12,
}

class HTMLNode{
    
    constructor(){
        this.uid          = UniqueIdAlloc();
        this.tagName      = "";
        this.text         = "";
        this.attributes   = {};
        this.bind         = "";
        this.children     = [];
        this.dynamicAttrs = {};
        this.parent       = null;
        this.isForNode    = false;
        this.forLoop      = {};
        this.layout       = {};
        this.style        = {};
        this.isDynamicText = false;
        this.static        = true;
        this.forPath       = "";
        this.component     = "";
        this.clickInfo     = {};
        this.id            = "";
        this.fontStyle     = {};

        //数据节点
        this.textData         = [];
        this.dynamicAttrsData = {};

        //
        this.forKeyPath = null;
    }

    setText(text){
        this.text = text;
        const list = VarExtract.parse(text);
        for (let i = 0; i < list.length; i++) {
            const element = list[i];
            if(element.type === 1) {
                this.isDynamicText = true;
                this.static = false;
                break;
            }
        }
    }

    setAttributes(attrs){
        this.id = attrs["id"] ? attrs["id"] : ''
        if (attrs["style"]) {
            this.parseStyleString(attrs["style"]);
            delete(attrs["style"]);
        }

        if(attrs['@click']){
            this.parseClickString(attrs['@click']);
            delete(attrs['@click']);
        }

        const contentMode = attrs['contentMode'];
        if (contentMode) {
            attrs['contentMode'] = '' + TokenViewModeMap[contentMode];
        }

        if (attrs[TokenInstructions.bind]) {
            this.bind = attrs[TokenInstructions.bind];
        }
        const forExp = attrs[TokenInstructions.for];
        if (forExp && forExp.length) {
            this.isForNode = true;
            this.static = false;
            this.forLoop = Util.parseForString(forExp);
        }

        const tableExp = attrs[TokenInstructions.tableData];
        if (this.tagName === "table" && tableExp.length) {
            this.isForNode = true;
            // 解析for 循环
            this.forLoop = Util.parseForString(tableExp);
        }

        this.attributes = attrs;

        for (const key in TokenInstructions) {
            const val = TokenInstructions[key];
            delete(this.attributes[val]);
        }

        this.extractDynamicAttributes(attrs);
    }    

    parseStyleString(styleString) {
        const r = {};
        styleString.split(';').filter((v) => {
            return v.length > 0;
        }).forEach((v) => {
            const list = v.split(':');
            if (list.length === 2) {
                r[list[0]] = list[1];
            }
        });
        this.style = r;
        this.parseFontInfo();
    }

    parseFontInfo() {
        const fontStyleKey  = 'font-style';
        const fontWeightKey = 'font-weight';
        const fontSizeKey   = 'font-size';
        const lineHeightKey = 'line-height';
        const fontFamilyKey = 'font-family';
        const textAlignKey  = 'text-align';
        const colorKey      = 'color';
        const highlightKey  = 'highlight-color'
        const fontAttributes = [fontStyleKey, fontWeightKey, fontSizeKey, lineHeightKey, fontFamilyKey, colorKey, textAlignKey, highlightKey];
        const styleKeys   = Object.keys(this.style);
        const fontStyle    = {};
        const alignMapper = {
            'left':0,
            "center":1,
            "right":2
        }
        for (let i = 0; i < styleKeys.length; i++) {
            const key = styleKeys[i];
            if (fontAttributes.includes(key)) {
                if (key === fontSizeKey) {
                    fontStyle[key] = this.style[key].replace('px','').trim();
                }
                if(key === textAlignKey) {
                    const alignValue = alignMapper[this.style[key].trim()];
                    fontStyle[key] = alignValue;
                }
                else {
                    fontStyle[key] = this.style[key].trim();
                }
                delete(this.style[key]);
            }
        }
        if (Object.keys(fontStyle).length){
            fontStyle.md5 = md5(JSON.stringify(fontStyle));
            this.fontStyle = fontStyle;
        }
    }

    parseClickString(text){
        this.clickInfo = Util.parseClickString(text);
    }

    extractDynamicAttributes(originAttrs) {
        for (const key in originAttrs) {
            const element = originAttrs[key];
            if (element.startsWith('{{') && element.endsWith('}}')) {
                this.static = false;
                if (this.attributes[key]) {
                    delete(this.attributes[key]);
                }
                this.dynamicAttrs[key] = element;
            }
        }
    }

    addChildNode(node){
        if(node){
            node.parent = this;
            this.children.push(node);
        }
    }

    seporateLayoutInStyle(obj){
        const [layout, style] = [{},{}];
        for (const key in obj) {
            const ele = obj[key];
            FlexValues[key] ? (layout[key.trim()] = ele.trim().replace("px","")) : (style[key.trim()] = ele.trim());
        }
        return {layout, style};
    }

    addStyle(style) {
        // 用<div style ="xxx"> 去覆盖 外部的style
        const copy = JSON.parse(JSON.stringify(style));
        this.style = Object.assign(copy, this.style);
    }

    broken(){
        this.parent = null;
        delete(this.parent);
        this.children.forEach((childNode)=>{
            childNode.broken();
        });
    }

    makeSeporate() {
        const r = this.seporateLayoutInStyle(this.style);
        for (const key in r.layout) {
            this.layout[key] = r.layout[key];
            delete(this.style[key]);
        }

        this.parseFontInfo();
        this.children.forEach((childNode)=>{
            childNode.makeSeporate();
        })
    }
}
module.exports = HTMLNode;