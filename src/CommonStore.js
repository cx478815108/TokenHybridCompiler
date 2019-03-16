const md5 = require("blueimp-md5");

class CommonStore {
    constructor(){
        this.md5Map = new Map();
        this.indexMap = new Map();
        this._uid = 0;
    }

    uuid(){
        this._uid += 1;
        return this._uid;
    }

    store(obj){
        const md5Key = md5(JSON.stringify(obj));
        let uuidKey = this.indexMap.get(md5Key);
        if(!uuidKey) {
            uuidKey = this.uuid();
            this.md5Map.set(md5Key, obj);
            this.indexMap.set(md5Key, uuidKey);
        }
        return "k"+uuidKey;
    }

    getJSONObj(){
        const o = {};
        for (const key of this.md5Map.keys()) {
            const reduceKey = "k" + this.indexMap.get(key);
            o[reduceKey]    = this.md5Map.get(key);
        }
        return o;
    }
}

module.exports = CommonStore;