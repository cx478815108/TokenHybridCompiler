module.exports = (function () {

    const _varExtract = {};

    function VarExtract() {
        this.stack = [];
        this.cache = {};
    }

    VarExtract.prototype.parse = function (text) {
        if (this.cache[text]) {
            return this.cache[text];
        }
        
        let [lpCount, rpCount, staticBegin, list] = [0,0,0,[]];
        for (let i = 0; i < text.length; i++) {
            switch (text[i]) {
                case '{':
                    {
                        lpCount += 1
                        if (lpCount == 2) {
                            this.stack.push(i);
                            const length = i - staticBegin - 1;
                            if (length) {
                                list.push({
                                    type:0,
                                    text: text.substr(staticBegin, length)
                                });
                            }
                            
                        }
                        break;
                    }
                case '}':
                    {
                        rpCount += 1
                        if (rpCount == 2) {
                            lpCount = 0;
                            staticBegin = i + 1;
                            this.stack.push(i - 2);
                            if(this.stack.length % 2 === 0) {
                                let r = this.stack.pop();
                                let l = this.stack.pop();
                                if (r - l) {
                                    list.push({
                                        type: 1,
                                        text: text.substr(l + 1, r - l)
                                    });
                                }
                            }
                        }
                        break;
                    }
                default:
                    rpCount = 0;
                    if(i === text.length - 1) {
                        const length = i - staticBegin + 1;
                        if (length) {
                            list.push({
                                type: 0,
                                text: text.substr(staticBegin, i - staticBegin + 1)
                            });
                        }
                    }
                    break;
            }
        }
        this.cache[text] = list;
        return list;
    }

    const obj = new VarExtract();

    _varExtract.parse = function parse(text) {
        if(!text || text.length === 0) return [];
        return obj.parse(text);
    }

    return _varExtract;
})();