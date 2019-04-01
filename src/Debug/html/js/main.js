const PORT     = 8011;
const URL      = "ws://127.0.0.1:" + PORT;
const WSSocket = io(URL);

const SocketEventNameAction = 'Action';

let App    = null;
let editor = null;

const connectSocketPort = ()=>{
    WSSocket.on('connect', function () {

        WSSocket.on('information',function(info){
            const mobileState = info.mobileConnect ? "已连接" : "未连接"
            App.setMobileState(mobileState);
            App.setIPAddress(info.ipAddress);
            App.projectFolderPaths = info.projectFolderPaths;
            if(!App.statusPath.length){
                App.statusPath = info.projectFolderPaths[0];
            }
            
            const projectNames = info.projectNames;
            App.setCompileProjectList(projectNames);

            if(info.scriptLog){
                App.setScriptLog("清空中...");
                setTimeout(() => {
                    App.setScriptLog("代码输出\n" + info.scriptLog);
                }, 50);
            }

            if(info.textLog){
                App.setCompilerLog("清空中...");
                setTimeout(() => {
                    App.setCompilerLog(info.textLog);
                }, 50);
            }
        });

        WSSocket.on('alert',function (text){
            App.alert(text);
        });
    });
}

const sendEventActionMessage = (code)=>{
    const info       = {}
    info.script      = editor.getValue();
    info.projectName = App.selectedFolderName;
    info.actionCode  = code;
    info.compileOpinion = App.compileOpinion;
    WSSocket.emit(SocketEventNameAction, info);
}

let selectedFolderNameMark = false;

const createApp = () => {
    App = new Vue({
        el: '#center',
        methods: {
            alert(text){
                this.$Message.info(text);
            },
            setCompileProjectList(list) {
                const r = Array.isArray(list) ? list : [];
                this.projectList = list;
                if(!selectedFolderNameMark){
                    selectedFolderNameMark = true;
                    this.selectedFolderName = r[0];
                }
            },
            setCompilerLog(log){
                this.compilerLog = log;
            },
            setScriptLog(log) {
                this.scriptLog = log;
            },
            setIPAddress(value) {
                //设置ip地址
                this.infos[0].data = value;
            },
            setMobileState(state) {
                //设置当前的state
                this.infos[1].data = state;
            },
            runScript() {
                sendEventActionMessage(2019);
            },
            reloadZip() {
                sendEventActionMessage(2010);
            },
            compileCodes() {
                sendEventActionMessage(2011);
            },
            reloadApp(){
                sendEventActionMessage(2013);
            },
            uploadZip(){
                this.$Modal.confirm({
                    title: '确定要上传到测试环境吗？',
                    content: `<span>即将编译后上传<strong>${this.selectedFolderName}.zip</strong></span>`,
                    onOk: () => {
                        this.compilerLog = "";
                        sendEventActionMessage(2014);
                    }
                });
            },
            didSelectedProjectList(index){
                this.selectdProjectIndex = index;
                this.selectedFolderName = this.projectList[index];
                this.statusPath = this.projectFolderPaths[index];
            }
        },
        data: function () {
            return {
                selectedFolderName: "",
                compilerLog: "",
                scriptLog: "",
                selectdProjectIndex:0,
                statusPath:"",
                compileOpinion:{
                    zipJS:0,
                },
                projectFolderPaths:[],
                projectList:[],
                desc: [{
                        title: '信息',
                        key: 'desc'
                    },
                    {
                        title: '状态',
                        key: 'data'
                    }
                ],
                infos: [{
                        desc: '本机IP',
                        data: "脚本服务未启动"
                    },
                    {
                        desc: 'iPhone状态',
                        data: "未连接"
                    }
                ]
            };
        }
    })
}

window.onload = () => {
    // 创建Vue 组件
    createApp();

    // 创建文本编辑器
    editor = monaco.editor.create(document.getElementById('container'), {
        value: `console.log("Hello world!");`,
        language: 'javascript'
    });

    monaco.languages.registerCompletionItemProvider('javascript', {
        provideCompletionItems: () => {
            return { 
                suggestions: [
                    {    
                        label: 'Test',
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: 'getValue(${1:pattern})',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: '根据pattern描述的正则表达式，从数据项中获取匹配的字符串'
                    }
                ] 
            }
        }
    });

    // 连接服务器
    connectSocketPort();
}

