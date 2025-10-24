
import CryptoJS from 'crypto-js';

/**
 * Website
 */
function getTestURL(){
    this.$swal.fire({
        customClass: {
            popup: 'my-popup',
            title: 'my-title',
            content: 'my-content',
            input: 'my-custom-input',
            inputLabel: 'my-input-label',
            actions: 'my-swal2-actions'
        },
        title: this.$t("dashboard.website"),
        icon: 'question',
        input: 'text',
        showCancelButton: true,
        cancelButtonText: this.$t("dashboard.cancel"),
        html: `
            <div class="my-content">                   
                zB.: https://www.classtime.com
            </div>
            `,  
        didOpen: () => {
            document.getElementsByClassName('my-custom-input')[0].value = this.serverstatus.examSections[this.serverstatus.activeSection].domainname || ''
        },
        inputValidator: (value) => {
            if (!isValidFullDomainName(value)) {return 'Ungültige Domain!'}
        }  
    })
    .then((input) => {
        let domainname = input.value
        this.serverstatus.examSections[this.serverstatus.activeSection].domainname = isValidFullDomainName(  domainname ) ? domainname : null

        if (!this.serverstatus.examSections[this.serverstatus.activeSection].domainname) { this.serverstatus.examSections[this.serverstatus.activeSection].examtype = "math"}
        else { this.backupinterval.stop(); this.autobackup = false;}  // no auto backup in this exam mode
        //console.log( this.serverstatus.domainname )
        this.setServerStatus()
    })  
}


/**
 * Eduvidual
 */
async function getTestID(){
    
    this.$swal.fire({
        customClass: {
            popup: 'my-popup',
            title: 'my-title',
            content: 'my-content',
            input: 'my-custom-input',
            inputLabel: 'my-input-label',
            actions: 'my-swal2-actions'
        },
        title: this.$t("dashboard.eduvidualid"),
        icon: 'question',
        showCancelButton: true,
        cancelButtonText: this.$t("dashboard.cancel"),
        input: 'url',
        inputLabel: this.$t("dashboard.eduvidualidhint"),
        inputPlaceholder: 'https://www.eduvidual.at/mod/quiz/view.php?id=6153159',
        html: `                    
            <div class="my-content" style="width: 150px; margin: auto auto;">
                <img  width="24" height="24" src="data:image/png;base64,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"/>
            </div>
           
        `,
        didOpen: () => {
            document.getElementById('swal2-input').value = this.serverstatus.examSections[this.serverstatus.activeSection].moodleURL
        },
        inputValidator: (value) => {
            if (!value || !isValidMoodleDomainName(value) ) {return 'No valid domain given!'}
            let { moodledomain, testid } = extractDomainAndId(value);
            if ( !testid) { return 'No valid ID given!'}
        }
    }).then((input) => {
        if (!input.value ) {
            this.serverstatus.examSections[this.serverstatus.activeSection].examtype = "math";
            return;
        }

        let { moodledomain, testid } = extractDomainAndId(input.value);

        this.serverstatus.examSections[this.serverstatus.activeSection].moodleTestId = testid
        this.serverstatus.examSections[this.serverstatus.activeSection].moodleDomain = moodledomain
        this.serverstatus.examSections[this.serverstatus.activeSection].moodleURL = input.value

        this.backupinterval.stop(); 
        this.autobackup = false;  // no auto backup in this exam mode
        this.setServerStatus()
    })  
}


/**
 * Google Forms
 */
async function getFormsID(){
    this.$swal.fire({
        customClass: {
            popup: 'my-popup',
            title: 'my-title',
            content: 'my-content',
            input: 'my-custom-input',
            inputLabel: 'my-input-label',
            actions: 'my-swal2-actions'
        },
        title: this.$t("dashboard.gforms"),
        icon: 'question',
        input: 'text',
        showCancelButton: true,
        cancelButtonText: this.$t("dashboard.cancel"),
        html: `<div class="m-1 my-content">
        ${this.$t("dashboard.gformshint")} <br>
        <span style="font-size:0.8em">
            (https://docs.google.com/forms/d/e/<span style="background-color: lightblue; padding:0 3px 0 3px;">1FAIpQLScuTG7yldD0VRhFgOC_2fhbVdgXn95Kf_w2rUbJm79S1kJBnA</span>/viewform)
        </span>
        </div>`,
        inputValidator: (value) => {
            if (!value) {return 'No ID given!'}
        }
    }).then((input) => {
        if (!input.value) { this.serverstatus.examSections[this.serverstatus.activeSection].examtype = "math"}
        else {
            this.serverstatus.examSections[this.serverstatus.activeSection].gformsTestId = input.value
            this.backupinterval.stop();
            this.autobackup = false;
        }
        this.setServerStatus()
    })  
}


/**
 * Math (GeoGebra)
 */
async function configureMath(){
    
    this.$swal.fire({
        title: this.$t("dashboard.math"),
        text: "OK",
        timer: 1000,
        timerProgressBar: true,
        didOpen: () => { this.$swal.showLoading() }
    });


    
}


/**
 * RDP
 */
async function configureRDP(){
    this.$swal.fire({
        customClass: {
            popup: 'my-popup',
            title: 'my-title',
            content: 'my-content',
            input: 'my-custom-input',
            actions: 'my-swal2-actions'
        },
        title: this.$t("dashboard.rdp"),
        icon: 'question',
        html: `
        <div class="my-content">
            <span class="text">${this.$t("dashboard.rdpconfiginfo")}</span>
            <br> <br>
            <label>
                <input type="text" id="domain" class="form-control my-select" placeholder="rdweb.schule.lan">
            </label>
            
        </div>
        `,
        showCancelButton: true,
        cancelButtonText: this.$t("dashboard.cancel"),
        didOpen: () => {
            if (this.serverstatus.examSections[this.serverstatus.activeSection].rdpConfig) {
                document.getElementById('domain').value = this.serverstatus.examSections[this.serverstatus.activeSection].rdpConfig.domain || ''
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const domain = document.getElementById('domain').value.trim();
            
            if (!domain) {
                this.$swal.fire({
                    title: "Fehler",
                    text: "Bitte geben Sie eine gültige Domain ein.",
                    icon: "error"
                });
                return;
            }

            const rdpConfig = {
                domain: domain
            }

            this.serverstatus.examSections[this.serverstatus.activeSection].rdpConfig = rdpConfig;
            this.setServerStatus();
        }
    });
}


/**
* Text Editor
*/
async function configureEditor(){
    const inputOptions = new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                'de-DE': this.$t("dashboard.de"),
                'en-GB': this.$t("dashboard.en"),
                'fr-FR': this.$t("dashboard.fr"),
                'es-ES': this.$t("dashboard.es"),
                'it-IT': this.$t("dashboard.it"),
                'sl-SI': this.$t("dashboard.sl"),
                'none':this.$t("dashboard.none"),
            })
        }, 100)
    })

    const updateMarginValueDisplay = () => {
        const marginValueInput = document.getElementById('marginValue');
        const marginValueDisplay = document.getElementById('marginValueDisplay');
        marginValueDisplay.textContent = marginValueInput.value;
    };

    const { value: language } = await this.$swal.fire({
        customClass: {
            popup: 'my-popup',
            title: 'my-title',
            content: 'my-content',
            input: 'my-custom-input',
            actions: 'my-swal2-actions'
        },
        title: this.$t("dashboard.texteditor"),
        html: `
        <div class="my-content" style="font-size: 0.8em !important; text-align:left; margin-left:6px;">
            <div>
                <label >
                    <h6>${this.$t("dashboard.cmargin-value")}</h6>
                    <input style="width:100px" type="range" id="marginValue" name="margin_value" min="2" max="5" step="0.5" value="${this.serverstatus.examSections[this.serverstatus.activeSection].cmargin.size}" />
                    <div style="width:32px; display: inline-block"  id="marginValueDisplay">${this.serverstatus.examSections[this.serverstatus.activeSection].cmargin.size}</div>(cm)
                </label>
                <br>
                <label>
                    <input type="radio" name="correction_margin" value="left"  />
                    ${this.$t("dashboard.cmargin-left")}
                </label>
                <label>
                    <input type="radio" name="correction_margin" value="right" checked/>
                    ${this.$t("dashboard.cmargin-right")}
                </label>
            </div>
            <div> 
                <h6> ${this.$t("dashboard.linespacing")}</h6>
                <label><input type="radio" name="linespacing" value="1"/> 1</label> &nbsp;
                <label><input type="radio" name="linespacing" value="2" checked/> 2</label> &nbsp;
                <label><input type="radio" name="linespacing" value="3"/> 3</label> &nbsp;
            </div>
            <div> 
                <h6>${this.$t("dashboard.fontfamily")}</h6>
                <label><input type="radio" name="fontfamily" value="serif"/> serif</label> &nbsp;
                <label><input type="radio" name="fontfamily" value="sans" checked/> sans-serif</label> &nbsp;
            </div>

            <div>
                <h6>${this.$t("dashboard.fontsize")}</h6>
                <select id="fontsize" class="my-select" value="12pt">
                    <option value="8pt">8 pt</option>
                    <option value="10pt">10 pt</option>
                    <option value="12pt">12 pt</option>
                    <option value="14pt">14 pt</option>
                    <option value="16pt">16 pt</option>
                    <option value="18pt">18 pt</option>
                    <option value="20pt">20 pt</option>
                </select>
            </div>

            <hr>
            <div>
                <h6>${this.$t("dashboard.audiorepeattitle")}</h6>
                <select id="audiorepeat" class="my-select">
                    <option value="0">${this.$t("dashboard.audioallow")}</option>
                    <option value="1">1 ${this.$t("dashboard.audiorepeat1")}</option>
                    <option value="2">2 ${this.$t("dashboard.audiorepeat2")}</option>
                    <option value="3">3 ${this.$t("dashboard.audiorepeat2")}</option>
                    <option value="4">4 ${this.$t("dashboard.audiorepeat2")}</option>
                </select>
            </div>

            <hr>
            <div>
                <h6>${this.$t("dashboard.spellcheck")}</h6>
               
                <input class="form-check-input" type="checkbox" id="checkboxLT">
                <label class="form-check-label" for="checkboxLT"> LanguageTool ${this.$t("dashboard.activate")} </label> <br>
                <input class="form-check-input" type="checkbox" id="checkboxsuggestions">
                <label class="form-check-label" for="checkboxsuggestions"> ${this.$t("dashboard.suggest")} </label><br><br>
               <h6 style="margin-bottom:0px">${this.$t("dashboard.spellcheckchoose")}</h6>
            </div>
             
        </div>`,
        input: 'select',
        inputOptions: inputOptions,
        focusConfirm: false,
        showCancelButton: true,
        cancelButtonText: this.$t("dashboard.cancel"),
        didOpen: () => {
            const marginValueInput = document.getElementById('marginValue');
            marginValueInput.addEventListener('input', updateMarginValueDisplay);
            document.getElementById('checkboxLT').checked = this.serverstatus.examSections[this.serverstatus.activeSection].languagetool
            document.getElementById('checkboxsuggestions').checked = this.serverstatus.examSections[this.serverstatus.activeSection].suggestions
            document.getElementById('audiorepeat').value = this.serverstatus.examSections[this.serverstatus.activeSection].audioRepeat
            
            // Setze den Radio-Button für linespacing
            const linespacing = this.serverstatus.examSections[this.serverstatus.activeSection].linespacing;
            const radioButton = document.querySelector(`input[name="linespacing"][value="${linespacing}"]`);
            if (radioButton) {
                radioButton.checked = true;
            }

            // Setze den Radio-Button für fontfamily
            const fontfamily = this.serverstatus.examSections[this.serverstatus.activeSection].fontfamily;
            const fontfamilyRadioButton = document.querySelector(`input[name="fontfamily"][value="${fontfamily}"]`);
            if (fontfamilyRadioButton) {
                fontfamilyRadioButton.checked = true;
            }

            // Setze den Radio-Button für correction_margin
            const correctionMargin = this.serverstatus.examSections[this.serverstatus.activeSection].cmargin.side;
            const correctionMarginRadioButton = document.querySelector(`input[name="correction_margin"][value="${correctionMargin}"]`);
            if (correctionMarginRadioButton) {
                correctionMarginRadioButton.checked = true;
            }

            // Setze den Wert für die Sprache
            const language = this.serverstatus.examSections[this.serverstatus.activeSection].spellchecklang;
            const selectElement = document.querySelector('.swal2-select');
            if (selectElement) {
                // Verzögerung beim Setzen des Werts
                setTimeout(() => {
                    selectElement.value = language;
                }, 100);
            }

            const defaultFontSize = this.serverstatus.examSections[this.serverstatus.activeSection].fontsize || '12pt';
            console.log("defaultFontSize:", defaultFontSize)
            const selectElement2 = document.getElementById('fontsize');
            if (selectElement2) {
                setTimeout(() => {
                    selectElement2.value = defaultFontSize;
                }, 100);
            }



            const checkboxLT = document.getElementById('checkboxLT');
            const checkboxSuggestions = document.getElementById('checkboxsuggestions');
            
            // Initial: suggestions-Checkbox deaktivieren, falls LT nicht gecheckt ist
            checkboxSuggestions.disabled = !checkboxLT.checked;
            
            // Event Listener für checkboxLT, um den Status von checkboxsuggestions anzupassen
            checkboxLT.addEventListener('change', () => {
                checkboxSuggestions.disabled = !checkboxLT.checked;
                // Wenn checkboxLT abgewählt wird, soll suggestions zusätzlich zurückgesetzt werden:
                if (!checkboxLT.checked) {
                    checkboxSuggestions.checked = false;
                }
            });

            
        },
        willClose: () => {
            const marginValueInput = document.getElementById('marginValue');
            marginValueInput.removeEventListener('input', updateMarginValueDisplay);
        },
        inputValidator: (value) => {
            if (!value) {  return 'You need to choose a language!' }

        },
        preConfirm: () => {
            this.serverstatus.examSections[this.serverstatus.activeSection].suggestions = document.getElementById('checkboxsuggestions').checked; 
            this.serverstatus.examSections[this.serverstatus.activeSection].languagetool = document.getElementById('checkboxLT').checked; 

            const radioButtons = document.querySelectorAll('input[name="correction_margin"]');
            const marginValue = document.getElementById('marginValue').value;
            const linespacingradioButtons = document.querySelectorAll('input[name="linespacing"]');
            const fontfamilyradioButtons = document.querySelectorAll('input[name="fontfamily"]');
            const audioRepeat = document.getElementById('audiorepeat').value;
            const fontSize = document.getElementById('fontsize').value;

            let selectedMargin = '';
            radioButtons.forEach((radio) => {
                if (radio.checked) {
                    selectedMargin = radio.value;
                }
            });

            let selectedSpacing = '';
            linespacingradioButtons.forEach((radio) => {
                if (radio.checked) {
                    selectedSpacing = radio.value;
                }
            });

            let selectedFont = '';
            fontfamilyradioButtons.forEach((radio) => {
                if (radio.checked) {
                    selectedFont = radio.value;
                }
            });

            if (marginValue && selectedMargin) {
                this.serverstatus.examSections[this.serverstatus.activeSection].cmargin = {
                    side: selectedMargin,
                    size: parseFloat(marginValue)
                }
               // console.log( this.serverstatus.cmargin)
            }


            this.serverstatus.examSections[this.serverstatus.activeSection].linespacing = selectedSpacing
            this.serverstatus.examSections[this.serverstatus.activeSection].fontfamily = selectedFont
            this.serverstatus.examSections[this.serverstatus.activeSection].fontsize = fontSize
            this.serverstatus.examSections[this.serverstatus.activeSection].audioRepeat = audioRepeat
        }
    })
    if (language) {
        this.serverstatus.examSections[this.serverstatus.activeSection].spellchecklang = language
        if (language === 'none'){this.serverstatus.examSections[this.serverstatus.activeSection].languagetool = false}
    }  
    else {
        this.serverstatus.examSections[this.serverstatus.activeSection].spellchecklang = 'de-DE'
    }

    this.setServerStatus()
}   




// Helper functions

function extractDomainAndId(url) {
    // Extract the full domain including subdomains
    var domainRegex = /^(https?:\/\/)?([^\/]+)/i;
    var match = url.match(domainRegex);
    var fullDomain = match ? match[2] : null;

    // Extract only the domain and TLD
    var domainParts = fullDomain.split('.').slice(-2).join('.');
    var moodledomain = domainParts;

    var idRegex = /id=(\d+)/;
    var idMatch = url.match(idRegex);
    var testid = idMatch ? idMatch[1] : null;
    return { moodledomain, testid };
}


function isValidMoodleDomainName(url) {
    // Improved regex for matching a domain name structure with optional protocol
    var regex = /^(https?:\/\/)(([a-z0-9-]+\.)+[a-z]{2,})(\/.*)?$/i;
    return regex.test(url);
}



function isValidFullDomainName(str) {
    try {
        // const urlString = str.includes('://') ? str : 'https://' + str; // Entfernt: Kein automatisches Hinzufügen von https://
        const urlString = str; // Nutzt den String direkt
        const url = new URL(urlString); // Erzeugt einen Fehler, wenn das Protokoll fehlt
        
        // Prüfe ob Protokoll korrekt ist
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return false;
        }

        // Prüfe ob Host vorhanden und gültig ist
        if (!url.hostname || url.hostname.length < 1) {
            return false;
        }

        // Prüfe ob Host mindestens einen gültigen Domain-Teil enthält
        const parts = url.hostname.split('.');
        if (parts.length < 2) {
            return false;
        }

        // Prüfe ob jeder Domain-Teil gültig ist
        const validPart = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
        return parts.every(part => 
            part.length > 0 && 
            part.length <= 63 && 
            validPart.test(part)
        );

    } catch (e) {
        // Fängt den Fehler der new URL(urlString) ab, wenn das Protokoll fehlt (z.B. bei 'classtime.com')
        return false;
    }
}




/**
 * define materials for exam
 * für jeden prüfungsabschnitt können materialien festgelegt werden die während der prüfung verfügbar sein sollen
 * diese werden bei prüfungsbeginn auf die clients verteilt bzw. beim start des entsprechenden abschnitts auf die clients verteilt
 * @param {*} who ist in diesem fall immer "all"
 * @returns 
 */
function defineMaterials(who) {
    let htmlcontent = `<div class="my-content"> 
        ${this.$t("dashboard.filesendtext")} <br>
        <span style="font-size:0.8em;">(.pdf, .docx, .bak, .ogg, .wav, .mp3, .jpg, .png, .gif, .ggb)</span>
        </div>`

    if (this.serverstatus.examSections[this.serverstatus.activeSection].groups && who == "all") {
        htmlcontent = `<div class="my-content"> 
            ${this.$t("dashboard.filesendtext")} <br>
            <span style="font-size:0.8em;">(.pdf, .docx, .bak, .ogg, .wav, .mp3, .jpg, .png, .gif, .ggb)</span>
            <br>  <br> 
            Gruppe<br>
            <button id="fbtnA" class="swal2-button btn btn-info m-2" style="width: 42px; height: 42px;">A</button>
            <button id="fbtnB" class="swal2-button btn btn-warning m-2" style="width: 42px; height: 42px;filter: grayscale(90%);">B</button>
            <button id="fbtnC" class="swal2-button btn btn-warning m-2" style="padding:0px;width: 42px; height: 42px;filter: grayscale(90%); background: linear-gradient(-60deg, #0dcaf0 50%, #ffc107 50%);">AB</button>
        </div>`
    }
    
    htmlcontent += `<div class="my-content" style="margin-top: 10px;">
        <h6>${this.$t("dashboard.allowedURL")}</h6>
        <input type="text" id="allowedURL" class="form-control my-custom-input" style="width: 60%!important; margin:4px!important;" placeholder="https://www.example.com">
    </div>` 
         
    let activeGroup = "a"  // prinzipiell ist jeder user automatisch in der gruppe a

    this.$swal.fire({
        customClass: {
            popup: 'my-popup',
            title: 'my-title',
            content: 'my-content',
            input: 'my-custom-input',
            inputLabel: 'my-input-label',
            actions: 'my-swal2-actions',
            htmlContainer: 'my-html-container'
        },
        title: this.$t("dashboard.materials"),
        html: htmlcontent,
        icon: "success",
        input: 'file',
        showCancelButton: true,
        cancelButtonText: this.$t("dashboard.cancel"),
        inputAttributes: {
            type: "file",
            name: "files",
            id: "swalFile",
            class: "form-control",
            multiple: "multiple",
            accept: ".pdf, .docx, .bak, .ogg, .wav, .mp3, .jpg, .png, .gif, .ggb"
        },
        didRender: () => {
            const btnA = document.getElementById('fbtnA');
            const btnB = document.getElementById('fbtnB');
            const btnC = document.getElementById('fbtnC');
            if (btnA && !btnA.dataset.listenerAdded) {
                btnA.addEventListener('click', () => {
                    btnA.style.filter = "grayscale(0%)"
                    btnB.style.filter = "grayscale(90%)"
                    btnC.style.filter = "grayscale(90%)"
                    activeGroup = "a"
                });
                btnA.dataset.listenerAdded = 'true';
            }
            if (btnB && !btnB.dataset.listenerAdded) {
                btnB.addEventListener('click', () => {
                    btnA.style.filter = "grayscale(90%)"
                    btnB.style.filter = "grayscale(0%)"
                    btnC.style.filter = "grayscale(90%)"
                    activeGroup = "b"
                });
                btnB.dataset.listenerAdded = 'true';
            }
            if (btnC && !btnC.dataset.listenerAdded) {
                btnC.addEventListener('click', () => {
                    btnA.style.filter = "grayscale(90%)"
                    btnB.style.filter = "grayscale(90%)"
                    btnC.style.filter = "grayscale(0%)"
                    activeGroup = "all"
                });
                btnC.dataset.listenerAdded = 'true';
            }
        },
        inputValidator: (value) => {
            
            const allowedURL = document.getElementById('allowedURL').value;
            if (allowedURL !== "" && !isValidFullDomainName(allowedURL)) {return 'Invalid Domain!'}
          
        },
    })
    .then(async (input) => {

        const allowedUrl = document.getElementById('allowedURL').value;
        if (allowedUrl) {
            //this.serverstatus.examSections[this.serverstatus.activeSection].allowedUrls.push(allowedUrl);

            if (activeGroup === "a" || activeGroup === "all") {
                //TODO:  check if site already exists and do not add if it does
                this.serverstatus.examSections[this.serverstatus.activeSection].groupA.allowedUrls.push(allowedUrl);
            }
            if (activeGroup === "b" || activeGroup === "all") {
                //TODO:  check if site already exists and do not add if it does
                this.serverstatus.examSections[this.serverstatus.activeSection].groupB.allowedUrls.push(allowedUrl);
            }

            this.setServerStatus()
        }
      
        if (!input.value) {   return;   } // no further processing if no files are selected

        this.status(this.$t("dashboard.processingfiles"));
        const files = input.value;

        // Process each file
        for (const file of files) {
            try {
                const base64Content = await readFileAsBase64(file); // Read file as Base64
                const checksum = await calculateMD5(file); // Calculate MD5 checksum
                
                let filetype = ""
                if  (file.type.includes("pdf")){  filetype="pdf" }         //pdf
                else if  (file.type.includes("bak")){  filetype="bak" }   // editor| backup file to replace editor content
                else if  (file.type.includes("openxml")){  filetype="docx" }   // editor| content file (from teacher) to replace content and continue writing
                else if  (file.type.includes("ggb")){  filetype="ggb" }  // geogebra
                else if  (file.type.includes("audio") || file.type.includes("ogg") || file.type.includes("wav") ){ filetype="audio" }  // audio
                else if  (file.type.includes("jpg") ||file.type.includes("jpeg") || file.type.includes("png") || file.type.includes("gif") ){ filetype="image" }  // images

                if (file.type=="" && file.name.includes("ggb")){ filetype = "ggb"}  // geogebra does not have a mime type

                const fileObject = {   // Create file object
                    filename: file.name,
                    filetype: filetype,
                    filecontent: base64Content,
                    checksum: checksum
                };

                if (activeGroup === "a" || activeGroup === "all") {
                    //TODO:  check if file already exists and ask to overwrite
                    this.serverstatus.examSections[this.serverstatus.activeSection].groupA.examInstructionFiles.push(fileObject);
                }
                if (activeGroup === "b" || activeGroup === "all") {
                    //TODO:  check if file already exists and ask to overwrite
                    this.serverstatus.examSections[this.serverstatus.activeSection].groupB.examInstructionFiles.push(fileObject);
                }
               
            } catch (error) {
                log.error(`exammanagement @ defineMaterials: Error processing file ${file.name}:`, error);
            }
        }

        this.setServerStatus()
    });    
}

// Helper function to read file as Base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Helper function to calculate MD5 checksum
async function calculateMD5(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
            const hash = CryptoJS.MD5(wordArray).toString();
            resolve(hash);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}



function handleAllowedUrlRemove(group, index){


    this.$swal.fire({
        customClass: {
            popup: 'my-popup',
            title: 'my-title',
            content: 'my-content',
            actions: 'my-swal2-actions',
            htmlContainer: 'my-content'
        },
        title: this.$t("dashboard.removeURL"),
        text: this.$t("dashboard.removeURLconfirm"),
        icon: 'warning',
        showCancelButton: true,
       
    }).then(async (result) => {
        if (result.isConfirmed) {


            if (group === "A") {
                this.serverstatus.examSections[this.serverstatus.activeSection].groupA.allowedUrls.splice(index, 1);
            } else {
                this.serverstatus.examSections[this.serverstatus.activeSection].groupB.allowedUrls.splice(index, 1);
            }
            this.setServerStatus()

        }
    })
}

function openAllowedUrl(allowedUrl){
    
    this.urlForWebview = allowedUrl;        // this is used to open the allowed url in the webview pane
    this.webviewVisible = true;             // this is used to show the webview pane

    document.querySelector("#pdfpreview").style.display = 'block';
    document.querySelector("#openPDF").style.display = 'none';
    document.querySelector("#downloadPDF").style.display = 'none';
    document.querySelector("#printPDF").style.display = 'none';
    document.querySelector("#closePDF").style.display = 'none';
    document.querySelector("#pdfembed").style.display = 'none';

}
















export { getTestURL, getTestID, getFormsID, configureEditor, configureMath, configureRDP, extractDomainAndId, isValidMoodleDomainName, isValidFullDomainName, defineMaterials, handleAllowedUrlRemove, openAllowedUrl }