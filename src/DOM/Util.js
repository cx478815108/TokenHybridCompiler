module.exports = {
    parseForString(forString) {
        if (!forString.length) { return null;}
        const g = forString.replace("(", "")
            .replace(")", "")
            .split('in ')
            .map((v) => {
                return v.trim();
            });
        const r = g[0].split(',');
        const o = {};
        o.valueKey = r[0].trim();
        if (r.length === 2) {
            o.indexKey = r[1].trim();
        } else {
            o.indexKey = 'index';
        }
        o.dataKey = g[1];
        return o;
    },
    parseCSSString(text){
        if (!text || !text.length) return {};
        const reg = new RegExp("/(?<!:)\\/\\/.*|\\/\\*(\\s|.)*?\\*\\/", 'g');
        const pureText = text.replace(reg, "");

        let braceMarker = 0;
        let selector = '';
        let ruleString = '';
        const r = {};
        for (let i = 0; i < pureText.length; i++) {
            const c = pureText[i];
            if (c == '{') {
                selector = pureText.substr(braceMarker, i - braceMarker).trim();
                braceMarker = i + 1;
            }
            if (c == '}') {
                ruleString = pureText.substr(braceMarker, i - braceMarker);
                braceMarker = i + 1;
                r[selector] = {};
                ruleString.split(';').forEach((val) => {
                    const s = val.trim();
                    if (s.length) {
                        let g = s.split(':');
                        if (g.length === 2) {
                            r[selector][g[0].trim()] = g[1].trim();
                        }
                    }
                });
            }
        }
        return r;
    },
    parseClickString(text) {
        const t = text.indexOf('(');
        const l = t > 0 ? t : text.length;
        const r = text.indexOf(')');
        const functionName = text.substring(0, l);
        const parametersString = text.substring(l + 1, r);
        const o = {}
        if (functionName.length === 0) {
            console.log('没有函数名');
        }

        o.f = functionName;
        const parameters = [];
        parametersString.split(',').map((v) => {
            return v.trim()
        }).forEach((v) => {
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                const m = v.substring(1,v.length - 1);
                parameters.push(m);
            } else {
                const n = Number(v);
                if (!isNaN(n)) {
                    parameters.push(n);
                }
            }
        });
        if (parameters.length) {
            o.p = parameters;
        }
        return o;
    },
    parseFontString(text){
        
    }
}