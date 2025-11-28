<template>
    <!-- HEADER START -->
    <exam-header
    :serverstatus="serverstatus"
      :clientinfo="clientinfo"
      :online="online"
      :clientname="clientname"
      :exammode="exammode"
      :servername="servername"
      :pincode="pincode"
      :battery="battery"
      :currenttime="currenttime"
      :timesinceentry="timesinceentry"
      :componentName="componentName"
      :localLockdown="localLockdown"
      :wlanInfo="wlanInfo"
      :hostip="hostip"
      @reconnect="reconnect"
      @gracefullyExit="gracefullyExit"
    ></exam-header>
     <!-- HEADER END -->

    <!-- filelist start - show local files from workfolder (pdf and gbb only)-->
    <div id="toolbar" class="d-inline p-1 pt-0"> 
        <button class="btn btn-primary p-0 pe-2 ps-1 me-1 mb-0 btn-sm" @click="loadPdfParserHtml" :title="$t('website.reloadwebview')"> <img src="/src/assets/img/svg/edit-redo.svg" class="" width="22" height="20" > {{$t('editor.reload')}} </button>


        <!-- exam materials start - these are base64 encoded files fetched on examstart or section start-->
        <div id="getmaterialsbutton" class="invisible-button btn btn-outline-cyan p-0  pe-2 ps-1 me-1 mb-0 btn-sm" @click="getExamMaterials()" :title="$t('editor.getmaterials')"><img src="/src/assets/img/svg/games-solve.svg" class="" width="22" height="22" style="vertical-align: top;"> {{ $t('editor.materials') }}</div>

        <div v-for="file in examMaterials" :key="file.filename" class="d-inline" style="text-align:left">
            <div v-if="(file.filetype == 'bak')" class="btn btn-outline-cyan p-0  pe-2 ps-1 me-1 mb-0 btn-sm"   @click="selectedFile=file.filename; loadBase64file(file)"><img src="/src/assets/img/svg/games-solve.svg" class="" width="22" height="22" style="vertical-align: top;"> {{file.filename}}</div>
            <div v-if="(file.filetype == 'docx')" class="btn btn-outline-cyan p-0  pe-2 ps-1 me-1 mb-0 btn-sm"   @click="selectedFile=file.filename; loadBase64file(file)"><img src="/src/assets/img/svg/games-solve.svg" class="" width="22" height="22" style="vertical-align: top;"> {{file.filename}}</div>
            <div v-if="(file.filetype == 'pdf')" class="btn btn-outline-cyan p-0 pe-2 ps-1 me-1 mb-0 btn-sm" @click="selectedFile=file.filename; loadBase64file(file)"><img src="/src/assets/img/svg/eye-fill.svg" class="grey" width="22" height="22" style="vertical-align: top;"> {{file.filename}} </div>
            <div v-if="(file.filetype == 'audio')" class="btn btn-outline-cyan p-0 pe-2 ps-1 me-1 mb-0 btn-sm" @click="loadBase64file(file)"><img src="/src/assets/img/svg/im-google-talk.svg" class="" width="22" height="22" style="vertical-align: top;"> {{file.filename}} </div>
            <div v-if="(file.filetype == 'image')" class="btn btn-outline-cyan p-0 pe-2 ps-1 me-1 mb-0 btn-sm" @click="selectedFile=file.filename; loadBase64file(file)"><img src="/src/assets/img/svg/eye-fill.svg" class="grey" width="22" height="22" style="vertical-align: top;"> {{file.filename}} </div>
        </div>
        <div v-if="allowedUrls.length !== 0"  v-for="allowedUrl in allowedUrls  " class="btn btn-outline-success p-0 pe-2 ps-1 me-1 mb-0 btn-sm allowed-url-button" :title="allowedUrl" @click="showUrl(allowedUrl)">
            <img src="/src/assets/img/svg/eye-fill.svg" class="grey" width="22" height="22" style="vertical-align: top;"> {{allowedUrl}} 
        </div>
        <!-- exam materials end -->

        <!-- local files start -->
        <div class="white text-muted me-2 ms-2 small d-inline-block mb-0" style="vertical-align: middle;">{{ $t('editor.localfiles') }} </div>
        <div v-for="file in localfiles" class="d-inline mb-0">
            <div v-if="(file.type == 'pdf')"   class="btn btn-info p-0 pe-2 ps-1 ms-1 mb-0 btn-sm" @click="selectedFile=file.name; loadPDF(file.name)"><img src="/src/assets/img/svg/document-replace.svg" class="" width="20" height="20" > {{file.name}} </div>
            <div v-if="(file.type == 'image')" class="btn btn-info p-0 pe-2 ps-1 ms-1 mb-0 btn-sm" @click="loadImage(file.name)"><img src="/src/assets/img/svg/eye-fill.svg" class="white" width="22" height="22" style="vertical-align: top;"> {{file.name}} </div>
        </div>
        <!-- local files end -->


    </div>
    <!-- filelist end -->
    
  

    <!-- angabe/pdf preview start -->
    <div id="preview" class="fadeinfast p-4">
        <WebviewPane
            id="webview"
            :src="urlForWebview || ''"
            :visible="webviewVisible"
            :allowed-url="urlForWebview"
            :block-external="true"
            @close="hidepreview"
        />
        <PdfviewPane
            :src="currentpreview"
            :localLockdown="localLockdown"
            :examtype="examtype"
            @close="hidepreview"
        />
    </div>
    <!-- angabe/pdf preview end -->

    <div id="content">
        <div v-if="!focus" class="focus-container">
            <div id="focuswarning" class="infodiv p-4 d-block focuswarning" >
                <div class="mb-3 row">
                    <div class="mb-3 "> {{$t('editor.leftkiosk')}} <br> {{$t('editor.tellsomeone')}} </div>
                    <img src="/src/assets/img/svg/eye-slash-fill.svg" class=" me-2" width="32" height="32" >
                    <div class="mt-3"> {{ formatTime(entrytime) }}</div>
                </div>
            </div>
        </div>

        <PdfOverlay
            :loading="isLoading"
            :pdf-base64="pdfBase64"
        />
    
    </div>
</template>

<script>
import moment from 'moment-timezone';
import ExamHeader from '../components/ExamHeader.vue';
import {SchedulerService} from '../utils/schedulerservice.js'
import { gracefullyExit, reconnect, showUrl } from '../utils/commonMethods.js'
import { getExamMaterials, loadPDF, loadImage} from '../utils/filehandler.js'
import PdfviewPane from '../components/PdfviewPane.vue'
import WebviewPane from '../components/WebviewPane.vue';
import PdfOverlay from '../components/PdfRenderer.vue';

export default {
    data() {
        return {
            // ... (Deine existierenden Data Properties hier behalten) ...
            componentName: 'PDF Forms',
            online: true,
            focus: true,
            exammode: false,
            examtype: this.$route.params.examtype,
            currentFile:null,
            fetchinfointerval: null,
            loadfilelistinterval: null,
            clockinterval: null,
            servername: this.$route.params.servername,
            servertoken: this.$route.params.servertoken,
            serverip: this.$route.params.serverip,
            token: this.$route.params.token,
            clientname: this.$route.params.clientname,
            serverApiPort: this.$route.params.serverApiPort,
            clientApiPort: this.$route.params.clientApiPort,
            electron: this.$route.params.electron,
            pincode : this.$route.params.pincode,
            serverstatus: this.$route.params.serverstatus,
            config: this.$route.params.config,
            localLockdown: this.$route.params.localLockdown,

            lockedSection: this.$route.params.serverstatus.examSections[this.$route.params.serverstatus.lockedSection],
            serverstatus: this.$route.params.serverstatus[this.$route.params.serverstatus.lockedSection],
            url: this.$route.params.serverstatus.examSections[this.$route.params.serverstatus.lockedSection].domainname,
            domain: null,

            clientinfo: null,
            entrytime: 0,
            timesinceentry: 0,
            currenttime: 0,
            now : new Date().getTime(),
            localfiles: null,
            battery: null,
          
            currentpreview: null,
            isLoading: true,
            wlanInfo: null,
            hostip: null,

            examMaterials: [],
            urlForWebview: null,
            allowedUrls: [],
            webviewVisible: false,
            allowedDomain: null, // Extracted domain for navigation validation
            
            // Event listener references for cleanup
            _onDidStartLoading: null,
            _onDidStopLoading: null,
            _onDomReady: null,
            _onPreviewClick: null,
            internetCheckCounter:0,
            
            pdfBase64: null
        }
    }, 
    components: { ExamHeader, PdfviewPane, WebviewPane, PdfOverlay },  
    methods: { 
        // ... (Deine existierenden Methoden: getExamMaterials, loadPDF, etc. behalten) ...
        // from filehandler.js
        getExamMaterials:getExamMaterials,
        loadPDF:loadPDF,
        loadImage:loadImage,
        gracefullyExit:gracefullyExit,
        showUrl:showUrl,
        reconnect:reconnect,
        hidepreview(){
            let preview = document.querySelector("#preview")
            preview.style.display = 'none';
            preview.setAttribute("src", "about:blank");
            URL.revokeObjectURL(this.currentpreview);
        },
        loadBase64file(file){
            this.webviewVisible = false
            if (file.filetype == 'pdf'){
                this.loadPDF(file, true)
                return
            }
            else if (file.filetype == 'image'){
                this.loadImage(file, true)
                return
            }
        },
       
        async sendFocuslost(){
            let response = await ipcRenderer.invoke('focuslost')  // refocus, go back to kiosk, inform teacher
            if (!this.config.development && !response.focus){  //immediately block frontend
                this.focus = false 
            }  
        },





        async loadFilelist(){
            let filelist = await ipcRenderer.invoke('getfilesasync', null)
            this.localfiles = filelist;
        },
        formatTime(unixTime) {
            const date = new Date(unixTime * 1000); // Convert Unix time to milliseconds
            return date.toLocaleTimeString('en-US', { hour12: false }); // Adjust locale and options as needed
        },
        clock(){
            this.now = new Date().getTime()
            this.timesinceentry =  new Date(this.now - this.entrytime).toISOString().substr(11, 8)
            this.currenttime = moment().tz('Europe/Vienna').format('HH:mm:ss');
        },  
        async fetchInfo() {
            let getinfo = await ipcRenderer.invoke('getinfoasync')   // we need to fetch the updated version of the systemconfig from express api (server.js)
            
            this.clientinfo = getinfo.clientinfo;
            this.token = this.clientinfo.token
            this.focus = this.clientinfo.focus
            this.clientname = this.clientinfo.name
            this.exammode = this.clientinfo.exammode
            this.pincode = this.clientinfo.pin

            if (!this.focus){  this.entrytime = new Date().getTime()}
            if (this.clientinfo && this.clientinfo.token){  this.online = true  }
            else { this.online = false  }

            this.battery = await navigator.getBattery().then(battery => { return battery })
            .catch(error => { console.error("Error accessing the Battery API:", error);  });
            
            this.internetCheckCounter++
            if (this.internetCheckCounter % 5 === 0){
                this.wlanInfo = await ipcRenderer.invoke('get-wlan-info')
                this.hostip = await ipcRenderer.invoke('checkhostip')
                this.internetCheckCounter = 0
            }

        }, 
        // --- NEW: Refactored PDF Loader ---
        async loadPdfParserHtml() {
            try {
                this.isLoading = true;
                this.pdfBase64 = null;

                // 1. Get PDF Data
                const pdfData = await ipcRenderer.invoke('getPdfFromPublic', 'demo1.pdf');
                if (!pdfData) throw new Error('PDF file not found');

                this.pdfBase64 = pdfData;
                this.isLoading = false;

            } catch (error) {
                console.error('Error loading PDF:', error);
                this.isLoading = false;
            }
        },
    },
    computed: {
    },
    mounted() {
        // ... (Dein existierender Mounted Code) ...
        this.currentFile = this.clientname
        this.entrytime = new Date().getTime()  
    
        this.$nextTick(async () => { 
            this.loadfilelistinterval = new SchedulerService(20000);
            this.loadfilelistinterval.addEventListener('action',  this.loadFilelist);
            this.loadfilelistinterval.start();
            
            this.clockinterval = new SchedulerService(1000);
            this.clockinterval.addEventListener('action', this.clock);  // Event-Listener hinzufügen, der auf das 'action'-Event reagiert (reagiert nur auf 'action' von dieser instanz und interferiert nicht)
            this.clockinterval.start();
                
            document.body.addEventListener('mouseleave', this.sendFocuslost);
            
            ipcRenderer.on('getmaterials', (event) => {   this.getExamMaterials()  });

            // add some eventlisteners once
            this._onPreviewClick = function() {  
                this.style.display = 'none';
                this.setAttribute("src", "about:blank");
                URL.revokeObjectURL(this.currentpreview);
            };
            document.querySelector("#preview").addEventListener("click", this._onPreviewClick);


            this.wlanInfo = await ipcRenderer.invoke('get-wlan-info')
            this.hostip = await ipcRenderer.invoke('checkhostip')


            this.hidepreview()
            this.loadFilelist()
            this.getExamMaterials()
            this.loadPdfParserHtml()

        });
    },
        beforeUnmount() {
        // Clean up interval services
        if (this.fetchinfointerval) {
            this.fetchinfointerval.removeEventListener('action', this.fetchInfo);
            this.fetchinfointerval.stop();
        }

        if (this.clockinterval) {
            this.clockinterval.removeEventListener('action', this.clock);
            this.clockinterval.stop();
        }

        if (this.loadfilelistinterval) {
            this.loadfilelistinterval.removeEventListener('action', this.loadFilelist);
            this.loadfilelistinterval.stop();
        }

        // Clean up DOM event listeners
        document.body.removeEventListener('mouseleave', this.sendFocuslost);
        
        // Clean up preview click listener
        const preview = document.querySelector("#preview");
        if (preview && this._onPreviewClick) {
            preview.removeEventListener("click", this._onPreviewClick);
        }

        // Clean up IPC listeners
        if (typeof ipcRenderer !== 'undefined' && ipcRenderer) {
            ipcRenderer.removeAllListeners('getmaterials');
        }
    },
    
}
</script>

<style scoped>
#toolbar {
    z-index: 10001;
    background-color: rgba(var(--bs-dark-rgb))
}

#content {
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
}

#preview {
    display: none;
    position: absolute;
    top:0;
    left: 0;
    width:100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.4);
    z-index:100001;
    backdrop-filter: blur(2px);
  
}



</style>