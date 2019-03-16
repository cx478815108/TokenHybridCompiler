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

            const projectNames = info.projectNames;
            App.setCompileProjectList(projectNames);

            const zipNames = info.reloadZipNames;
            App.setUniqueNameList(zipNames);

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
    info.projectName = App.selectedCompileFolderName;
    info.zipName     = App.selectedUniqueName;
    info.actionCode  = code;
    WSSocket.emit(SocketEventNameAction, info);
}

let selectedUniqueNameFirstSet = false;
let selectedFolderNameFirstSet = false;

const createApp = () => {
    App = new Vue({
        el: '#center',
        methods: {
            alert(text){
                this.$Message.info(text);
            },
            setUniqueNameList(list){
                const r = Array.isArray(list) ? list : [];
                this.uniqueNameList = r;
                if(!selectedUniqueNameFirstSet){
                    selectedUniqueNameFirstSet = true;
                    this.selectedUniqueName = r.length ? r[0] : '暂无';
                }
            },
            setCompileProjectList(list) {
                const r = Array.isArray(list) ? list : [];
                this.compileProjectList = r;
                if(!selectedFolderNameFirstSet){
                    selectedFolderNameFirstSet = true;
                    this.selectedCompileFolderName = r.length ? r[0] : '暂无';
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
            setCurrentUniqueName(name) {
                //设置当前的Unique
                this.selectedUniqueName = name;
                this.infos[1].data = name;
            },
            setCurrentCompileFolderName(name) {
                //设置当前的编译
                this.selectedCompileFolderName = name;
                this.infos[2].data = name;
            },
            setMobileState(state) {
                //设置当前的state
                this.infos[3].data = state;
            },
            didSelectedUniqueName() {
                //选中回调
                this.infos[1].data = this.selectedUniqueName;
            },
            didSelectedCompileProjectName() {
                //选中回调
                this.infos[2].data = this.selectedCompileFolderName;
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
            changeMobileAppName(){
                sendEventActionMessage(2012);
            },
            reloadApp(){
                sendEventActionMessage(2013);
            },
            uploadZip(){
                this.$Modal.confirm({
                    title: '确定要上传到测试环境吗？',
                    content: `<p>即将编译后上传${this.selectedUniqueName}.zip</p>`,
                    onOk: () => {
                        this.compilerLog = "";
                        sendEventActionMessage(2014);
                    }
                });
            }
        },
        data: function () {
            return {
                defaultUniqueName: "",
                selectedUniqueName: "",
                defaultCompileFolderName: "",
                selectedCompileFolderName: "",
                compilerLog: "",
                scriptLog: "",
                uniqueNameList: [
                ],
                compileProjectList:[],
                desc: [{
                        title: '信息',
                        key: 'desc'
                    },
                    {
                        title: '状态',
                        key: 'data'
                    }, {
                        title: 'Action',
                        key: 'action',
                        slot: 'action',
                    }
                ],
                infos: [{
                        desc: '本机IP',
                        data: "脚本服务未启动"
                    },
                    {
                        desc: '重载包名',
                        data: "暂无"
                    },
                    {
                        desc: '当前编译目录',
                        data: "暂无"
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

    // 连接服务器
    connectSocketPort();
}

