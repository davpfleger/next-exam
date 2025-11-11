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
        <button class="btn btn-primary p-0 pe-2 ps-1 me-1 mb-0 btn-sm" @click="reloadWebview" :title="$t('website.reloadwebview')"> <img src="/src/assets/img/svg/edit-redo.svg" class="" width="22" height="20" >{{domain}}</button>


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
        <!-- focus warning start -->
        <div v-if="!focus" class="focus-container">
            <div id="focuswarning" class="infodiv p-4 d-block focuswarning" >
                <div class="mb-3 row">
                    <div class="mb-3 "> {{$t('editor.leftkiosk')}} <br> {{$t('editor.tellsomeone')}} </div>
                    <img src="/src/assets/img/svg/eye-slash-fill.svg" class=" me-2" width="32" height="32" >
                    <div class="mt-3"> {{ formatTime(entrytime) }}</div>
                </div>
            </div>
        </div>
        <!-- focuswarning end  -->


        <div v-if="isLoading" class="overlay">
            <div class="spinner"></div>
            <p>Loading...</p>
        </div>

        <!-- <webview id="webview" autosize="on" ref="wv"  style="width:100%;height:100%"  :src="url" allowpopups></webview> -->
        <webview id="webviewmain" autosize="on" ref="wvmain"   :src="url" :style="{ visibility: isLoading ? 'hidden' : 'visible' }"  allowpopups></webview>

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

export default {
    data() {
        return {
            componentName: 'Website',
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
            _onWillNavigate: null,
            _onDidFinishLoad: null,
            _onDidStartLoading: null,
            _onDidStopLoading: null,
            _onDomReady: null,
            _onPreviewClick: null,
        }
    }, 
    components: { ExamHeader, PdfviewPane, WebviewPane },  
    methods: { 

        // from filehandler.js
        getExamMaterials:getExamMaterials,
        loadPDF:loadPDF,
        loadImage:loadImage,

        // from commonMethods.js
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


        reloadWebview(){
            this.$refs.wvmain.setAttribute("src", this.url);
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
            
            this.wlanInfo = await ipcRenderer.invoke('get-wlan-info')
            this.hostip = await ipcRenderer.invoke('checkhostip')

        }, 
       
    },
    mounted() {
        
        console.log(`website @ mounted: ${this.url}`)

        this.currentFile = this.clientname
        this.entrytime = new Date().getTime()  
    
        this.$nextTick(() => { // Code that will run only after the entire view has been rendered
            
            this.domain = this.url
            // Extract domain for navigation validation (remove protocol, path, and port) using URL API for robustness
            try {
                const urlObj = new URL(this.url);
                this.allowedDomain = urlObj.hostname; // This gives us just the domain without port
                console.log(`website @ mounted: extracted allowedDomain="${this.allowedDomain}" from url="${this.url}"`);
            } catch (error) {
                // Fallback to regex extraction if URL parsing fails
                this.allowedDomain = this.url.replace(/https?:\/\//, '').split('/')[0].split(':')[0];
                console.log(`website @ mounted: fallback extraction, allowedDomain="${this.allowedDomain}"`);
            }
  
            // intervalle nicht mit setInterval() da dies sämtliche objekte der callbacks inklusive fetch() antworten im speicher behält bis das interval gestoppt wird
            this.fetchinfointerval = new SchedulerService(5000);
            this.fetchinfointerval.addEventListener('action',  this.fetchInfo);  // Event-Listener hinzufügen, der auf das 'action'-Event reagiert (reagiert nur auf 'action' von dieser instanz und interferiert nicht)
            this.fetchinfointerval.start();
                
            this.loadfilelistinterval = new SchedulerService(20000);
            this.loadfilelistinterval.addEventListener('action',  this.loadFilelist);
            this.loadfilelistinterval.start();
            
            this.clockinterval = new SchedulerService(1000);
            this.clockinterval.addEventListener('action', this.clock);  // Event-Listener hinzufügen, der auf das 'action'-Event reagiert (reagiert nur auf 'action' von dieser instanz und interferiert nicht)
            this.clockinterval.start();
                
            document.body.addEventListener('mouseleave', this.sendFocuslost);
            
            ipcRenderer.on('getmaterials', (event) => {  //trigger document save by signal "save" sent from sendExamtoteacher in communication handler
                console.log("website @ getmaterials: get materials request received")
                this.getExamMaterials() 
            });


            this.loadFilelist()
            this.getExamMaterials()

            const webview = document.getElementById('webviewmain');
            if (webview) {
                const shadowRoot = webview.shadowRoot;
                const iframe = shadowRoot.querySelector('iframe');
                if (iframe) { iframe.style.height = '100%'; } 
            }
            

            // add some eventlisteners once
            this._onPreviewClick = function() {  
                this.style.display = 'none';
                this.setAttribute("src", "about:blank");
                URL.revokeObjectURL(this.currentpreview);
            };
            document.querySelector("#preview").addEventListener("click", this._onPreviewClick);



            this._onDomReady = () => {
                if (config.showdevtools){ webview.openDevTools();   }

                const css = `
  
                `;
                webview.executeJavaScript(`
                    (() => {  // Anonyme Funktion für eigenen Scope sonst wird beim reload der page (absenden der form ) die variable erneut deklariert und failed
                        const style = document.createElement('style');
                        style.type = 'text/css';
                        style.innerHTML = \`${css}\`;
                        document.head.appendChild(style);

                    })();  
                `);
            };
            webview.addEventListener('dom-ready', this._onDomReady);

                    
            // Event abfangen, wenn eine Navigation beginnt
            this._onWillNavigate = (event) => {
                if (!event.url.includes(this.url)){  //we block everything except pages that contain the following keyword-combinations
                    console.log(event.url)
                 
                    const isValidUrl = (testUrl) => {
                        try {
                            // Extract the actual domain from the test URL (remove protocol, port, path, query, fragment)
                            const testUrlObj = new URL(testUrl);
                            const testDomain = testUrlObj.hostname; // This gives us just the domain without port
                            
                            // Debug logging to see what's being compared
                            console.log(`webview @ will-navigate: comparing testDomain="${testDomain}" with allowedDomain="${this.allowedDomain}"`);
                            
                            // Exact match: testDomain must exactly match allowedDomain
                            if (testDomain === this.allowedDomain) {
                                console.log(`webview @ will-navigate: exact match allowed`);
                                return true;
                            }
                            
                            // Subdomain check: testDomain must end with '.' + allowedDomain
                            // e.g., www.example.com matches example.com, but malicious-example.com does not
                            // This ensures we only allow real subdomains, not domains that just happen to contain the allowed domain
                            if (testDomain.endsWith('.' + this.allowedDomain)) {
                                // Additional safety: ensure it's a real subdomain by checking the character before the dot
                                const prefix = testDomain.slice(0, -(this.allowedDomain.length + 1));
                                // Prefix must be a valid subdomain part (not empty, no dots, valid characters)
                                if (prefix && !prefix.includes('.') && /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(prefix)) {
                                    console.log(`webview @ will-navigate: valid subdomain match (prefix="${prefix}")`);
                                    return true;
                                } else {
                                    console.log(`webview @ will-navigate: invalid subdomain prefix="${prefix}"`);
                                }
                            }
                            
                            console.log(`webview @ will-navigate: domain validation failed`);
                            return false;
                        } catch (error) {
                            // If URL parsing fails, reject it
                            console.log(`webview @ will-navigate: URL parsing error for ${testUrl}:`, error);
                            return false;
                        }
                    };

                    //check if this an exception (subdomain, login, init) - if URL doesn't include either of these combinations - block! EXPLICIT is easier to read ;-)
                    if ( isValidUrl(event.url) ) { console.log("webview @ will-navigate: url allowed") }  // allow subdomain
                   
                    // allow microsoft login / google login / google accounts / 2fa activation / microsoft365 login / google lookup
                    else if ( event.url.includes("login") && event.url.includes("Microsoft") )                                 { console.log("webview @ will-navigate: url allowed") }  // microsoft login
                    else if ( event.url.includes("login") && event.url.includes("Google") )                                    { console.log("webview @ will-navigate: url allowed") }  // google login
                    else if ( event.url.includes("accounts") && event.url.includes("google.com") )                             { console.log("webview @ will-navigate: url allowed") }  // google accounts
                    else if ( event.url.includes("mysignins") && event.url.includes("microsoft") )                             { console.log("webview @ will-navigate: url allowed") }  // 2fa activation
                    else if ( event.url.includes("account") && event.url.includes("windowsazure") )                            { console.log("webview @ will-navigate: url allowed") }  // microsoft braucht mehr contact information (telnr)
                    else if ( event.url.includes("login") && event.url.includes("microsoftonline") )                           { console.log("webview @ will-navigate: url allowed") }  // microsoft365 login
                    else if ( event.url.includes("lookup") && event.url.includes("google") )                                   { console.log("webview @ will-navigate: url allowed") }  // google lookup
                    else if ( event.url.includes("bildung.gv.at") && event.url.includes("SAML2") )                                   { console.log("webview @ will-navigate: url allowed") }  // google lookup
                    else if ( event.url.includes("id-austria.gv.at") && event.url.includes("authHandler") )                                   { console.log("webview @ will-navigate: url allowed") }  // google lookup

                    else {
                        console.log("webview @ will-navigate: blocked leaving exam mode")
                        console.log(`webview @ will-navigate: url: ${event.url}`)
                        webview.stop()
                    }
                }
                else { console.log("webview @ will-navigate: entered valid test environment")  }
            };
            webview.addEventListener('will-navigate', this._onWillNavigate);


            this._onDidFinishLoad = () => {
                if (!this.url.includes("lms.at")){ return} // only for lms.at
                const preloadScriptContent = `
                    (function() {
                        const css = \`
                        * {transition: .1s !important;}
                        #ibook-menu {display: none !important;}
                        .attempt-list {display: none !important;}
                        \`;

                        const style = document.createElement('style');
                        style.type = 'text/css';
                        style.innerHTML = css;
                        document.head.appendChild(style);
                    })();
                `;
                webview.executeJavaScript(preloadScriptContent)
                .then(() => {     this.isLoading = false;  })  // Verberge das Overlay und zeige den Webview-Inhalt
                .catch((err) => { this.isLoading = false;  })
            };
            webview.addEventListener('did-finish-load', this._onDidFinishLoad);




            // loading events to hide css manipulation
            this._onDidStartLoading = () => { this.isLoading = true;   }; // Zeige das Overlay während des Ladens
            this._onDidStopLoading = () => {   this.isLoading = false;  };           // Verberge das Overlay, wenn das Laden gestoppt ist
            webview.addEventListener('did-start-loading', this._onDidStartLoading);
            webview.addEventListener('did-stop-loading', this._onDidStopLoading);
            



        });
    },
    beforeUnmount() {
        this.fetchinfointerval.removeEventListener('action', this.fetchInfo);
        this.fetchinfointerval.stop() 

        this.clockinterval.removeEventListener('action', this.clock);
        this.clockinterval.stop() 

        this.loadfilelistinterval.removeEventListener('action', this.loadFilelist);
        this.loadfilelistinterval.stop() 

        document.body.removeEventListener('mouseleave', this.sendFocuslost);
        
        // Clean up webview event listeners
        const webview = document.getElementById('webviewmain');
        if (webview) {
            if (this._onWillNavigate) {
                webview.removeEventListener('will-navigate', this._onWillNavigate);
            }
            if (this._onDidFinishLoad) {
                webview.removeEventListener('did-finish-load', this._onDidFinishLoad);
            }
            if (this._onDidStartLoading) {
                webview.removeEventListener('did-start-loading', this._onDidStartLoading);
            }
            if (this._onDidStopLoading) {
                webview.removeEventListener('did-stop-loading', this._onDidStopLoading);
            }
            if (this._onDomReady) {
                webview.removeEventListener('dom-ready', this._onDomReady);
            }
        }
        
        // Clean up preview click listener
        const preview = document.querySelector("#preview");
        if (preview && this._onPreviewClick) {
            preview.removeEventListener("click", this._onPreviewClick);
        }
    },
}
</script>

<style scoped>


#toolbar {
    z-index: 10001;
    background-color: rgba(var(--bs-dark-rgb))
}


.overlay {
  position: fixed;
  top:45px;
  left: 0;
  width: 100%;
  height: 100%;

  background-color: #eef2f8;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.spinner {
  border: 16px solid #fff;
  border-top: 16px solid #3498db;
  border-radius: 50%;
  width: 120px;
  height: 120px;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}



#webviewmain{
    height: 100% !important;
    width: 100% !important;
    display: block;
    position: relative;
    top:0;
    left:0;
}

iframe{
    height: 100% !important;
    width: 100% !important;
}


@media print{
    #apphead {
        display: none !important;
    }
    #content {
        height: 100vh !important;
        width: 100vw !important;
        border-radius:0px !important;
    }
    #geogebraframe{
        height: 100% !important;
        width: 100% !important;
    }
    #app {
        display:block !important;
        height: 100% !important;
       
    }
    ::-webkit-scrollbar {
        display: none;
    }
}

#localfiles {
    position: relative;
   

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
