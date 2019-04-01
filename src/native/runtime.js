// https://skalman.github.io/UglifyJS-online/
const token = (()=>{

    let notifyAccess = false;
    let originArrayItemPath = [];

    const isEqual = (left, right) => {
        const [lt, rt] = [typeof left, typeof right];
        if (lt !== rt) return false;
        if (lt === "object") {
            if (Array.isArray(left)) {
                const length = left.length;
                if (Array.isArray(right) && length === right.length) {
                    for (let i = 0; i < length; i++) {
                        const [lele, rele] = [left[i], right[i]];
                        if (typeof lele !== "object" && lele !== rele) return false;
                        if (!isEqual(lele, rele)) return false;
                    }
                    return true;
                }
                return false;
            }

            const [lKeys, rKeys] = [Object.keys(left), Object.keys(right)];
            const length = lKeys.length;
            if (length !== rKeys.length) return false;
            for (let i = 0; i < length; i++) {
                const key = lKeys[i];
                const [lele, rele] = [left[key], right[key]];
                if (typeof lele !== "object" && lele !== rele) return false;
                if (!isEqual(lele, rele)) return false;
            }
            return true;
        }

        return left === right;
    }

    const CreateObserve = (obj, notify) => {

        let globlePathStack = [];
        const globleWeakMap = new WeakMap();
        let accessedFunc = false;
        let theNewTarget = null;

        const RecursiveProxy = (data, notify) => {

            const set = (target, key, value, receiver) => {
                const setValue = target[key];
                const _v = Reflect.set(target, key, value, receiver);
                if (notify) {
                    globlePathStack.push(key);
                    notify(target, globlePathStack, setValue, value, originArrayItemPath);
                    notifyAccess = false;
                }
                return _v;
            }

            const get = (target, key, receiver) => {
                const getValue = target[key];
                if (notifyAccess) {
                    return target[key];
                }

                if (Array.isArray(target[key])) {
                    originArrayItemPath.push(key);
                }

                if (originArrayItemPath.length && typeof key === 'string') {
                    const index = parseInt(key);
                    if (!isNaN(index)) {
                        originArrayItemPath.push(key);
                    }
                }

                if (!accessedFunc) {
                    if (typeof getValue === "function") {
                        accessedFunc = true;
                    } else {
                        globlePathStack.push(key);
                    }
                }

                if (typeof getValue === "object") {
                    if (!globleWeakMap.get(getValue)) {
                        const delegate = new Proxy(getValue, {
                            set,
                            get
                        });
                        Reflect.set(target, key, delegate, receiver);
                        globleWeakMap.set(delegate, true);
                        return delegate;
                    }
                }
                return Reflect.get(target, key, receiver);
            }

            return new Proxy(data, {
                set,
                get
            })
        }

        const fenceProxy = (data, notify) => {
            const config = {
                set: (target, key, value, receiver) => {
                    globlePathStack = [];
                    Reflect.set(target, key, value, receiver);
                    theNewTarget = null;
                },
                get: (target, key, receiver) => {
                    globlePathStack = [];
                    accessedFunc = false;
                    originArrayItemPath = [];
                    theNewTarget = target;
                    return Reflect.get(target, key, receiver);
                }
            }

            return new Proxy(RecursiveProxy(data, notify), config);
        }

        const dataCopy = JSON.parse(JSON.stringify(obj));
        return fenceProxy(dataCopy, notify);
    }

    const producePathLink = (pathStack) => {
        let [root, head, trail] = [{}, {}, {}];
        const count = pathStack.length;
        for (let i = 0; i < count; i++) {
            const key = pathStack[i];
            const link = {
                key
            };
            if (i == 0) {
                root = head = link;
                continue;
            }
            trail = link;
            head.next = link;
            head = trail;
        }
        trail ? delete(trail.next) : null;
        return root;
    }

    const getDiffInfo = (target, pathStack, oldValue, newValue) => {
        const DiffUpdate = 0;
        const DiffInsert = 1;
        const DiffDelete = 2;
        let type = DiffUpdate; //update 0 - 'u'
        const info = {
            oldValue
        };
        let pathLink;
        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
            pathLink = producePathLink(pathStack);
            if (newValue.length == 0) {
                info.type = DiffDelete;
                info.newVal = [];
                info.keyPath = pathLink;
                return info;
            }
            const min = Math.min(oldValue.length, newValue.length);
            const oldMin = oldValue.slice(0, min);
            const newMin = newValue.slice(0, min);
            if (isEqual(oldMin, newMin)) {
                if (oldValue.length > newValue.length) {
                    type = DiffDelete //delete 2 - 'd'
                    info.newValue = oldMin;
                } else {
                    type = DiffInsert //add 1 - 'i'
                    info.newValue = newValue.slice(min, newValue.length);
                }
            } else {
                info.newValue = newValue;
            }
        } else if (Array.isArray(target)) {
            type = oldValue ? DiffUpdate : DiffInsert;
            info.newValue = oldValue ? newValue : [newValue];
            pathLink = producePathLink(oldValue ? pathStack : pathStack.slice(0, pathStack.length - 1));
        } else {
            pathLink = producePathLink(pathStack);
            info.newValue = newValue;
        }
        info.type = type;
        info.keyPath = pathLink;
        return info;
    }

    class TokenComponent {
        constructor(key, obj) {
            this.componentName = key;
            this.methods = obj.methods;
            this.listeners = obj.listeners;
            if(typeof obj.data === "function"){
                this.data = CreateObserve(obj.data(), (target, pathStack, oldVal, newVal, originArrayItemPath) => {
                    notifyAccess = true;
                    if (isEqual(oldVal, newVal)) return;
                    const diffInfo = getDiffInfo(target, pathStack, oldVal, newVal);
                    diffInfo.component = this.componentName;
    
                    if (originArrayItemPath.length) {
                        let data = this.data;
                        let key = '';
                        while (key = originArrayItemPath.shift()) {
                            data = data ? data[key] : data;
                        }
                        diffInfo.newArrayItem = data;
                    }
    
                    if (typeof TokenDataChanged == "function") {
                        TokenDataChanged(diffInfo);
                    } else {
                        console.log(JSON.stringify(diffInfo));
                    }
                });
            }
        }
    }

    class Token {
        constructor() {
            this.components = new Map();
        }

        registComponent(key, obj) {
            if (!obj.data || typeof obj.data !== "function") return;
            this.components.set(key, obj);
        }

        getComponent(key) {
            return this.components.get(key);
        }
    }

    const token = new Token();
    const e = {};
    const observedComponents = new Map();

    e.registComponent = function (key, obj) {
        const o = new TokenComponent(key, obj);
        observedComponents.set(key, o);
        token.registComponent(key, obj)
        return o;
    }

    e.getListener = function (listenerName,componentName) {
        const c = token.components.get(componentName);
        if(c && c.listeners){
            return c.listeners[listenerName];
        }
        return null;
    }

    e.getComponent = function (key) {
        return observedComponents.get(key);
    }

    e.getComponentData = function () {
        const data = {};
        for (const name of token.components.keys()) {
            const component = token.components.get(name);
            if(typeof component.data === "function"){
                data[name] = component.data();
            }
        }
        return data;
    }

    e.navigateTo = function (obj) {
        TokenNavigateToFirst(obj);
    }

    e.navigateToRoot = function (obj) {
        TokenNavigateTo(obj);
    }

    e.navigateBack = function(obj) {
        TokenNavigateBack(obj);
    }

    e.exitApp = function () {
        TokenExitApp();
    }

    e.invokeComponentMethod = function (clickInfo) {
        const component = observedComponents.get(clickInfo.component);
        if (!component && !component.methods) return;
        const method = component.methods[clickInfo.f];
        if (typeof method !== "function") return;
        const args = clickInfo.p;
        if (!args) {
            return method();
        }
        const _data = clickInfo['$'];
        if (_data) {
            args.push(_data);
        }
        method(...args);
    }

    return e;

})();

class Animation{
    constructor(c,id){
        this.c = c;
        this.id = id;
    }

    commit(){
        const self = this;
        return new Promise((resolve,rejects)=>{
            TokenCommitAnimation(self.c,self.id,resolve);
        });
    }

    static create(c,id) {
        return new Animation(c,id);
    }

    static animation(excution,parameters){
        return {
            commit(components){
                if (!Array.isArray(components)) return Promise.reject("commit() should receive Array!");
                return new Promise((resolve)=>{
                    const ids = [];
                    components.forEach(element => {
                        if(element.id){
                            ids.push(element.id);
                        }
                    });
                    if(ids.length === 0) {
                        resolve();
                        return;
                    }
                    // js 端组件调用设置属性
                    excution();
                    // 开始native设置
                    $native.animation(ids,parameters,()=>{
                        //完成回调
                        resolve();
                    });
                });
            }
        }
    }
}

const App = (obj)=>{
    // lcs = lifeCircles
    if(!this.lcs && typeof obj === "object"){
        TokenLifeCirclesDefine(obj);
        this.lcs = obj;
    }
    return this.lcs;
}

$http = (()=>{
    class HTTP {

        request(o){
            return new Promise((resolve,reject)=>{
                const _op = {};
                _op.url = o.url;
                // default
                _op.method = o.method || "GET";
                _op.timeout = o.timeout || 30;
                
                const key = (o.type === "json") ? 
                                 'responseJSON' : 
                                 'responseText'
                _op[key] = (data,response)=>{resolve({data,response})};
                if(o.cache) {_op.cache = true;}
                if(o.ua) {_op.UA = o.ua;}
                if(o.headers) {_op.headers = o.headers;}
                if(o.data) {_op.parameters = o.data;}
                if(o.redirect) {_op.redirect = o.redirect;}
    
                _op.failure = (reason,code)=>{
                    reject({reason,code});
                }
                $native.request(_op);
            });
        }
    
        postJSON(url,data){
            return this.request({
                url,
                data,
                method:"POST",
                type:'json',
            })
        }
    
        getJSON(url){
            return this.request({
                url,
                type:'json',
            });
        }
    
        getText(url,data){
            return this.request({url});
        }
    
        postText(url,data){
            return this.request({
                url,
                data,
                method:"POST",
            })
        }
    }

    return new HTTP();
})();