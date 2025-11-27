<template>
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
     <div id="toolbar" class="d-inline p-1 pt-0"> 
        <button class="btn btn-primary p-0 pe-2 ps-1 me-1 mb-0 btn-sm" @click="loadPdfParserHtml" :title="$t('website.reloadwebview')"> <img src="/src/assets/img/svg/edit-redo.svg" class="" width="22" height="20" >reload pdf</button>
        </div>
    
    <div id="preview" class="fadeinfast p-4">
        <WebviewPane id="webview" :src="urlForWebview || ''" :visible="webviewVisible" :allowed-url="urlForWebview" :block-external="true" @close="hidepreview" />
        <PdfviewPane :src="currentpreview" :localLockdown="localLockdown" :examtype="examtype" @close="hidepreview" />
    </div>

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

        <div v-if="isLoading" class="overlay">
            <div class="spinner"></div>
            <p>Loading PDF...</p>
        </div>

        <div v-if="!isLoading && pdfPages.length > 0" class="pdf-scroll-container">
            
            <div 
                v-for="(page, pageIndex) in pdfPages" 
                :key="pageIndex" 
                class="pdf-page-wrapper"
                :style="{ width: page.width + 'px', height: page.height + 'px' }"
            >
                <img :src="page.imgSrc" class="pdf-bg-image" />

                <div 
                    v-for="(field, fIndex) in page.formFields" 
                    :key="'field-'+pageIndex+'-'+fIndex"
                    class="input-overlay"
                    :style="field.style"
                >
                    <input 
                        v-if="field.type === 'checkbox'" 
                        type="checkbox" 
                        :checked="field.checked"
                        :name="field.name"
                        class="interactive-input checkbox"
                    />
                    <textarea 
                        v-else-if="field.type === 'textarea'"
                        :name="field.name"
                        class="interactive-input textarea"
                    >{{ field.value }}</textarea>
                    <input 
                        v-else 
                        type="text" 
                        :value="field.value" 
                        :name="field.name"
                        class="interactive-input text"
                    />
                </div>

                <div 
                    v-for="(cloze, cIndex) in page.clozeFields" 
                    :key="'cloze-'+pageIndex+'-'+cIndex"
                    :class="['input-overlay', cloze.type === 'checkbox' ? 'checkbox-overlay' : '']"
                    :style="cloze.style"
                >
                    <input 
                        v-if="cloze.type === 'checkbox'"
                        type="checkbox"
                        :checked="cloze.checked || false"
                        :name="'checkbox_'+pageIndex+'_'+cIndex"
                        class="interactive-input checkbox"
                    />
                    <input 
                        v-else
                        type="text" 
                        class="interactive-input cloze" 
                        :name="'cloze_'+pageIndex+'_'+cIndex" 
                    />
                </div>
                
                <!-- Box Fields (gezeichnete Rechtecke: Tabellen/Textareas) -->
                <div 
                    v-for="(box, bIndex) in page.boxFields" 
                    :key="'box-'+pageIndex+'-'+bIndex"
                    :class="['input-overlay', box.type === 'checkbox' ? 'checkbox-overlay' : '']"
                    :style="box.style"
                >
                    <input 
                        v-if="box.type === 'checkbox'"
                        type="checkbox"
                        :name="'box_checkbox_'+pageIndex+'_'+bIndex"
                        class="interactive-input checkbox"
                    />
                    <textarea 
                        v-else-if="box.type === 'textarea' || box.isTextarea"
                        class="interactive-input textarea"
                        :name="'box_area_'+pageIndex+'_'+bIndex"
                    ></textarea>
                    <input 
                        v-else
                        type="text" 
                        class="interactive-input table-cell" 
                        :name="'box_cell_'+pageIndex+'_'+bIndex" 
                    />
                </div>
            </div>

        </div>
    
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
import { parsePdfToPages } from '../utils/pdfparser.js';

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
            
            // CHANGED: Instead of a string, we store structured data
            pdfPages: [], // Array of { width, height, imgSrc, formFields[], clozeFields[] }
            
            internetCheckCounter:0
        }
    }, 
    components: { ExamHeader, PdfviewPane, WebviewPane },  
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
                this.pdfPages = []; // Reset pages

                // 1. Get PDF Data
                const pdfData = await ipcRenderer.invoke('getPdfFromPublic', 'demo3.pdf');
                if (!pdfData) throw new Error('PDF file not found');

                // 2. Parse PDF using utility function
                const pagesData = await parsePdfToPages(pdfData);
                
                this.pdfPages = pagesData; // Update Vue State -> triggers v-for
                this.isLoading = false;

            } catch (error) {
                console.error('Error loading PDF:', error);
                this.isLoading = false;
            }
        },
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

            this._onDidStartLoading = () => { this.isLoading = true;   }; // Zeige das Overlay während des Ladens
            this._onDidStopLoading = () => {   this.isLoading = false;  };           // Verberge das Overlay, wenn das Laden gestoppt ist
            webview.addEventListener('did-start-loading', this._onDidStartLoading);
            webview.addEventListener('did-stop-loading', this._onDidStopLoading);

            this.wlanInfo = await ipcRenderer.invoke('get-wlan-info')
            this.hostip = await ipcRenderer.invoke('checkhostip')



            this.hidepreview()
            this.loadFilelist()
            this.getExamMaterials()
            this.loadPdfParserHtml()

        });
    },
    // ... (beforeUnmount etc. behalten) ...
}
</script>

<style scoped>
/* Vorhandene Styles */
#toolbar {
    z-index: 10001;
    background-color: rgba(var(--bs-dark-rgb))
}

/* ... (Spinner etc. behalten) ... */

/* NEW Styles for the PDF Viewer */
#content {
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
}

.pdf-scroll-container {
    background-color: #eee;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: fit-content;
}

.pdf-page-wrapper {
    position: relative; /* Anchor for absolute children */
    background: white;
    margin-bottom: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
}

.pdf-bg-image {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none; /* Image shouldn't capture clicks */
}

.input-overlay {
    position: absolute;
}

.checkbox-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
}


.interactive-input {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    margin: 0;
    
    /* Slight yellow background to make fields visible */
    background-color: rgba(255, 230, 0, 0.15); 
    border: 1px solid transparent;
}

.interactive-input:focus {
    background-color: rgba(255, 255, 255, 0.9);
    border: 2px solid #0d6efd; /* Bootstrap Primary Blue */
    outline: none;
    box-shadow: 0 0 5px rgba(13, 110, 253, 0.5);
}

.interactive-input.checkbox {
    cursor: pointer;
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    /* border: 1px solid #0d6efd; */
    background-color: rgba(255, 255, 255, 0.9);
    appearance: none;
}

.interactive-input.checkbox:checked {
    background-color: rgba(13, 110, 253, 0.85);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23fff' d='M6.4 11.2 3.5 8.3l1.4-1.4 1.5 1.5 4.3-4.3 1.4 1.4z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 70% 70%;
}

.interactive-input.cloze {
    border-bottom: 0px solid black;
    background: transparent;
}
.interactive-input.cloze:focus {
    background: white;
}

/* Styling für die automatisch erkannten Boxen */
.interactive-input.table-cell {
    background-color: rgba(0, 255, 0, 0.05); /* Sehr leichtes Grün zur Unterscheidung */
    border: none;
}
.interactive-input.table-cell:focus {
    background-color: rgba(255, 255, 255, 0.9);
    border: 2px solid #0d6efd;
}

.interactive-input.textarea {
    resize: none; /* User darf Größe nicht ändern, da vom PDF vorgegeben */
    background-color: rgba(0, 0, 255, 0.05); /* Sehr leichtes Blau */
    border: none;
    font-family: inherit;
    font-size: inherit;
    padding: 5px;
}
.interactive-input.textarea:focus {
    background-color: rgba(255, 255, 255, 0.95);
    border: 2px solid #0d6efd;
    outline: none;
}
</style>