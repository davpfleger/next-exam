/**
 * @license GPL LICENSE
 * Copyright (c) 2021 Thomas Michael Weissel
 * 
 * This program is free software: you can redistribute it and/or modify it 
 * under the terms of the GNU General Public License as published by the Free Software Foundation,
 * either version 3 of the License, or any later version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>
 */



import fs from 'fs'
//import i18n from '../../renderer/src/locales/locales.js'
//const { t } = i18n.global
import { BrowserWindow, ipcMain, dialog } from 'electron'
import {join} from 'path'
import log from 'electron-log';
import { networkInterfaces } from 'os'

import pdfToPrinter from "pdf-to-printer";
const { print: printWin } = pdfToPrinter;

import { print } from "unix-print";
//import { print as printWin } from "pdf-to-printer";
import { exec } from 'child_process';

import { gateway4sync} from 'default-gateway';

import ip from 'ip'

import server from "../../server/src/server.js"
import checkDiskSpace from 'check-disk-space';


class IpcHandler {
    constructor () {
        this.multicastClient = null
        this.config = null
        this.WindowHandler = null
    }
    init (mc, config, wh, ch) {
        this.multicastClient = mc
        this.config = config
        this.WindowHandler = wh  
        this.CommunicationHandler = ch



        /**
         *  Start BIP Login Sequence
         */
        ipcMain.on('loginBiP', (event, biptest) => {
            log.info("ipchandler @ loginBiP: opening bip window. testenvironment:", biptest)
            this.WindowHandler.createBiPLoginWin(biptest)
            event.returnValue = "hello from bip logon"
        })



        // returns the current serverstatus object of the given server(name)
        ipcMain.handle('getserverstatus', (event, servername) => { 
            const mcServer = this.config.examServerList[servername]
            if (mcServer ) { return mcServer.serverstatus  }
            else {           return false  }
        }) 


        // stops the current exam server 
        // (this is a copy of the /stopserver/:servername route in control.js )
        // rethink concept that local requests go to the API (this had a non electron server version in mind but makes no sense in electron only app)
        ipcMain.handle('stopserver', (event, servername) => { 
            const mcServer = this.config.examServerList[servername]
            if (mcServer ) { 
                mcServer.broadcastInterval.stop()
                mcServer.server.close();
                delete config.examServerList[servername]    //delete mcServer
                this.multicastClient.examServerList = this.multicastClient.examServerList.filter(exam => exam.servername !== servername)  // multicastclient keeps track of running servers in the lan
                return true
            }
            else {  return false  }
        }) 


        //return current studentlist
        ipcMain.handle('studentlist', (event, servername) => { 
            const mcServer = this.config.examServerList[servername]
            if (mcServer ) { 
                return {studentlist: mcServer.studentList}
            }
            else {  
                return {sender: "server", message:"notfound", status: "error", studentlist: []}
            }
        }) 




        // opens a loginwindow for microsoft 365
        ipcMain.on('openmsauth', (event) => { this.WindowHandler.createMsauthWindow();  event.returnValue = true })  


        // returns current config
        ipcMain.on('getconfig', (event) => {  
            event.returnValue = this.copyConfig(config); 
        })  


        // returns current config async
        ipcMain.handle('getconfigasync', (event) => {  
            return this.copyConfig(config)
        })  


        // log out of microsoft 365
        ipcMain.handle('resetToken', async (event) => { 
            const win = this.WindowHandler.mainwindow; // Oder wie auch immer Sie auf Ihr BrowserWindow-Objekt zugreifen
            if (!win) return;

            await win.webContents.session.clearCache();
            await win.webContents.session.clearStorageData({
                storages: ['cookies']
              });

            config.accessToken = false

            log.info("ipchandler @ resetToken: Logged out of Office365")
            return this.copyConfig(config);  // we cant just copy the config because it contains examServerList which contains config (circular structure)
        })  


        /**
         * opens file in external program - platform dependent
         */
        ipcMain.handle('openfile', (event, filepath) => {  
            const cmd = process.platform === 'win32' ? `start " " "${filepath}"` :
            process.platform === 'darwin' ? `open "${filepath}"` :
            `xdg-open "${filepath}"`;

            try {
                exec(cmd, (error) => {
                    if (error) {
                        log.error('ipchandler @ openfile: Error opening PDF in external reader:', error);
                        return false
                    }
                    log.info('ipchandler @ openfile: File opened in external reader');
                    return true
                });
            }
            catch(err){
                log.error('ipchandler @ openfile: Error opening PDF:', err);
                return false
            }
        })  


        ipcMain.on('getCurrentWorkdir', (event) => {   event.returnValue = config.workdirectory  })


        ipcMain.handle('checkDiscspace', async () => {
                let diskSpace = await checkDiskSpace(config.workdirectory);
                let free = Math.round(diskSpace.free / 1024 / 1024 / 1024 * 1000) / 1000;
                //log.info("ipchandler @ checkDiskspace:",diskSpace)
                return free;    
        });

        ipcMain.handle('setbackupdir', async (event, arg) => {
            const result = await dialog.showOpenDialog( this.WindowHandler.mainwindow, { properties: ['openDirectory']  })
            if (!result.canceled){
                log.info('directories selected', result.filePaths)
                let message = ""
                try {
                    let testdir = join(result.filePaths[0]   , config.serverdirectory)
                    if (!fs.existsSync(testdir)){fs.mkdirSync(testdir)}
                    message = "success"
                    //config.workdirectory = testdir
                    config.backupdirectory = testdir
                    log.info("ipchandler @ setbackupdir:", config)
                }
                catch (e){
                    message = "error"
                    log.error(e)
                }
                return {backupdir: config.backupdirectory, message : message}
            }
            else {
                return {backupdir: config.backupdirectory, message : 'canceled'}
            }
        })


        ipcMain.on('setPreviousWorkdir', async (event, workdir) => {
            if (workdir){
                log.info('previous directory selected', workdir)
                let message = ""
                try {
                    if (!fs.existsSync(workdir)){fs.mkdirSync(workdir)}
                    message = "success"
                    config.workdirectory = workdir
                }
                catch (e){
                    message = "error"
                    log.error(e)
                }
                event.returnValue = {workdir: config.workdirectory, message : message}
            }
            else {  event.returnValue = {workdir: config.workdirectory, message : 'canceled'} }
        })


        ipcMain.handle('createBipExamdirectory', async (event, exam) => {
            let message = ""
            const workdir = join(config.workdirectory, exam.examName)
            const filePath = join(workdir, 'serverstatus.json');
            

            try {
                if (!fs.existsSync(workdir)){fs.mkdirSync(workdir)}
                message = "success"
            }
            catch (e){
                message = e.message
                log.error(e)
            }

            try {  fs.writeFileSync(filePath, JSON.stringify(exam, null, 2));  }   // save mcServer.serverstatus as JSON file
            catch (error) {  log.error(error) }
                  
            event.returnValue = {message : message}

        })

         /**
         * ASYNC GET LOG FILE from examdirectory
         */ 
        ipcMain.handle('getlog', async (event) => {   
            const workdir = join(config.workdirectory,"/")
            let filepath = join(workdir,"next-exam-teacher.log")
           
            try {
                let data = fs.readFileSync(filepath, 'utf8')
                
                let serverlog = data.trim()
                .split('\n')
                .map(line => {
                  const match = line.match(/^\[(.+?)\]\s+\[(.+?)\]\s+(.*)$/);
                  if (match) {
                    const [, date, type, rawText] = match;
                    
                    // Set color based on log type
                    let color;
                    switch (type.toLowerCase()) {
                      case 'info':
                        color = '#0aa2c0';
                        break;
                      case 'warn':
                        color = 'var(--bs-warning)';
                        break;
                      case 'error':
                        color = 'var(--bs-danger)';
                        break;
                      default:
                        color = 'var(--bs-cyan)';
                    }
                    
                    // Default values
                    let source = 'next-exam';
                    let text = rawText;
                    
                    // If a colon is present: everything before the first colon as 'source'
                    if (rawText.includes(':')) {
                      const colonIndex = rawText.indexOf(':');
                      source = rawText.substring(0, colonIndex).trim();
                      text = rawText.substring(colonIndex + 1).trim();
                    }
                    
                    return { date, type, text, color, source };
                  }
                  return null;
                })
                .filter(item => item !== null);


                return serverlog
            }
            catch (err) {
                log.error(`ipchandler @ getlog: ${err}`); 
                return false
            }
            
        })


        /**
         * returns old exam folders in workdirectory
         */

        ipcMain.handle('scanWorkdir', async (event, arg) => {
            let examfolders = [] // array for results
            if (fs.existsSync(config.workdirectory)) { // check if base dir exists
                const folders = fs.readdirSync(config.workdirectory, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name)
                for (const dirname of folders) { // iterate over directory names
                    const serverstatusPath = join(config.workdirectory, dirname, 'serverstatus.json')
                    if (fs.existsSync(serverstatusPath)) { // check if file exists
                    
                    const serverstatus = JSON.parse(fs.readFileSync(serverstatusPath, 'utf-8')) // parse JSON to object
                    if (!serverstatus.examName) {
                        serverstatus.examName = dirname
                    }

                    examfolders.push(serverstatus) // add object to array
                    }
                }
            }
            return examfolders // return results
          })



        /**
         * deletes old exam folder in workdirectory
         */
        ipcMain.handle('delPrevious', async (event, arg) => {
            let examdir = join( config.workdirectory, arg)
            if (fs.statSync(examdir).isDirectory()){
                try {
                    fs.rmSync(examdir, { recursive: true, force: true });
                }
                catch (e) {log.error(e)}
            }   
            return examdir
        })




        /**
         * get system printers
         */
        ipcMain.handle('getprinters', async (event, arg) => {
            const printers = await this.WindowHandler.mainwindow.webContents.getPrintersAsync();
            const printerData = printers.map(printer => ({
                printerName: printer.name,
                isDefault: printer.isDefault,
                description: printer.description
            }));

            return printerData
        })



        /**
         * print a pdf file via print() on linux, mac and printWin() on windows
         */
        ipcMain.handle('printpdf', async (event, pdfurl, defaultPrinter) => {
            log.info(`ipchandler: printpdf: ${pdfurl} defaultprinter: ${defaultPrinter}`)
            
            let printOptions = {}
            let printer = undefined

            if (defaultPrinter){   // we do not use printoptions YET but if we can chose the default printer via dashboard ui then do not ask again here
                printOptions = {
                    printDialog: false,
                    printer: defaultPrinter // Set the selected printer
                  };
                printer = defaultPrinter
            }

            if (process.platform === "linux" || process.platform === "darwin"){
                print(pdfurl, printer).then( ()=>{ log.info('ipchandler: printpdf: file sent to printer')} )
                .catch( (err) =>{
                    log.error(`ipchandler: printpdf (unix): ${err}`)
                });
            }
            else {
                printWin(pdfurl, printOptions).then( ()=>{ log.info('ipchandler: printpdf: file sent to printer')} )
                .catch( (err) =>{
                    log.error(`ipchandler: printpdf (win): ${err}`)
                });
            }
            
        })


        /**
         * Print a Document as base64 string via webcontents.print() without specific platformdependent libraries
         * INFO: it is currently not possible to get a "finished-rendering" event from the chrome-pdf-plugin. therefore timeouts are used as a workaround
         */
        ipcMain.handle('printBase64', async (event, docBase64, printerName, previewType) => {
            let hiddenWin = new BrowserWindow({
                show: false,
                webPreferences: {plugins: true,  webSecurity: false }
            });
            
    
            let dataUrl = ``;
            if (previewType === "pdf") {
                dataUrl = `data:application/pdf;base64,${docBase64}`;
            } 
            else if (previewType === "image") {
                dataUrl = `data:image/jpeg;base64,${docBase64}`;
            } else {
                log.error('ipchandler @ printbase64: Rendering/Print failed!');
                return
            }


            await hiddenWin.loadURL(dataUrl);
            hiddenWin.on('closed', () => { hiddenWin = null; });

            hiddenWin.webContents.on('did-stop-loading', async () => {
                const isPDFRendered = await hiddenWin.webContents.executeJavaScript(`
                    new Promise(resolve => {
                        let elapsed = 0;
                        const interval = 500; // Check every 100 ms
                        const timeout = 2000; // Maximum 1 second wait
                        const checkPDFLoaded = () => {
                            

                            const embed = document.querySelector('embed[type="application/pdf"]');
                            const img = document.querySelector('img');


                            if (embed && embed.clientHeight > 0) {
                                clearInterval(timer);
                                 setTimeout(() => {
                                    resolve(true); // PDF is assumed to be fully rendered
                                }, 1000);
                            } 
                            else if (img && img.clientHeight > 0) {
                                clearInterval(timer);
                                resolve(true); // Image is fully rendered
                            }    
                            else if (elapsed >= timeout) {
                                clearInterval(timer);
                                resolve(false); // Time expired, not rendered
                            } 
                            else { elapsed += interval; }
                        };
                        const timer = setInterval(checkPDFLoaded, interval);
                    });
                `);
                if (isPDFRendered) {
                    log.info(`ipchandler @ printbase64: base64 ${previewType} received - printing on: ${printerName}`)
                    hiddenWin.webContents.print({ silent: true, deviceName: printerName }, () => {
                        if (hiddenWin && !hiddenWin.isDestroyed()) {
                            hiddenWin.close();
                        }
                    });
                }
                else {
                    log.error('ipchandler @ printbase64: Rendering/Print failed!');
                }
            });
        });




        /**
         * re-check hostip and enable multicast client
         */ 
        ipcMain.on('checkhostip', async (event) => { 
            // Collect all available network interfaces with IP addresses
            const interfaces = networkInterfaces()
            let availableInterfaces = null
            
            // Collect all IPv4 addresses
            Object.keys(interfaces).forEach((interfaceName) => {
                interfaces[interfaceName].forEach((iface) => {
                    // Filter out loopback and local addresses
                    if (iface.family === 'IPv4' && 
                        !iface.address.startsWith('127.') && 
                        !iface.address.startsWith('169.254.')) {
                        if (!availableInterfaces) {
                            availableInterfaces = []
                        }
                        availableInterfaces.push({
                            name: interfaceName,
                            address: iface.address
                        })
                    }
                })
            })

            // Save the old IP address
            const oldHostIp = this.config.hostip

            // If a preferred interface is set, use it to quickly get an IP
            if (this.preferredInterface) {
                const preferred = availableInterfaces?.find(iface => iface.name === this.preferredInterface)
                if (preferred) {
                    this.config.hostip = preferred.address
                    this.config.interface = preferred.name
                    // Check if a gateway exists for the preferred interface
                    try {
                        const {gateway, version, int} = gateway4sync(preferred.name)
                        this.config.gateway = int === this.preferredInterface
                    } catch (e) {
                        this.config.gateway = false
                    }
                }
            } 
            else {
                try { 
                    const {gateway, version, int} =  gateway4sync()
                    this.config.hostip = ip.address(int)
                    this.config.interface = int
                    this.config.gateway = true
                }
                catch (e) {
                    this.config.hostip = false
                    this.config.gateway = false
                }

                if (!this.config.hostip) {
                    try {
                        this.config.hostip = ip.address() //this delivers an ip even if gateway is not set - the first ip address of the system
                        // use this address to find the name of the interface
                        const interfaceName = Object.keys(interfaces).find(key => interfaces[key].some(iface => iface.address === this.config.hostip))
                        this.config.interface = interfaceName

                    }  
                    catch (e) {
                        log.error("ipcHandler @ checkhostip: Unable to determine ip address")
                        this.config.hostip = false
                        this.config.gateway = false
                        this.config.interface = false
                    }
                }
            }
           
            // check if multicast client is running - otherwise start it
            if (this.config.hostip == "127.0.0.1") { this.config.hostip = false }

            // Check if the IP has changed and reinitialize everything if necessary
            if (oldHostIp !== this.config.hostip && this.config.hostip) {
                log.info(`main: IP changed from ${oldHostIp} to ${this.config.hostip}, reinitializing services...`)

                // Reinitialize multicast client on IP change (multicastclient is only used for discovery of other exam servers)
                if (this.multicastClient && this.multicastClient.client.address()) { // check if multicast client is actually running
                    try {
                        await this.multicastClient.stop()
                        this.multicastClient.init(this.config.gateway)
                        log.info('main: Multicast client reinitialized')
                    } 
                    catch (e) {
                        log.error('main: Failed to reinitialize multicast client:', e)
                    }
                }

                // Restart Express server on IP change
                if (server) {
                    if (server.listening) {
                        server.close(() => {
                            log.info(`main: Express server stopped due to IP change`)
                            server.listen(config.serverApiPort, () => {
                                log.info(`main: Express server restarted on https://${config.hostip}:${config.serverApiPort}`)
                            })
                        })
                    } 
                    else {
                        server.listen(config.serverApiPort, () => {
                            log.info(`main: Express server started on https://${config.hostip}:${config.serverApiPort}`)
                        })
                    }
                }
            } 
            // else if (this.config.hostip && this.multicastClient && !this.multicastClient.client.address()) {  // If no IP change but multicast client is not running
            //     this.multicastClient.init(this.config.gateway)
            // }
              
            event.returnValue = { 
                hostip: this.config.hostip, 
                interface: this.config.interface,
                availableInterfaces,
                preferredInterface: this.preferredInterface 
            }
        })

        // does what it says..  if more than one interface is found this will set the preferred interface
        ipcMain.handle('setPreferredInterface', (event, arg) => {
            this.preferredInterface = arg
        })


















        /**
         * Downloads the files for a specific student to his workdirectory (abgabe)
         */
        ipcMain.on('storeOnedriveFiles', async (event, args) => { 
            log.info("downloading onedrive files...")  
            const studentName = args.studentName
            const accessToken = args.accessToken
            const fileName = args.fileName
            const fileID = args.fileID
            const servername = args.servername

            // create user abgabe directory  // create archive directory
            let studentdirectory =  join(config.workdirectory, servername ,studentName)
            let time = new Date(new Date().getTime()).toLocaleTimeString();  //convert to locale string otherwise the foldernames will be created in UTC
            let tstring = String(time).replace(/:/g, "_");
            let studentarchivedir = join(studentdirectory, tstring)
            
            try {
                if (!fs.existsSync(studentdirectory)) { fs.mkdirSync(studentdirectory, { recursive: true });  }
                if (!fs.existsSync(studentarchivedir)){ fs.mkdirSync(studentarchivedir, { recursive: true }); }
            } catch (e) {log.error(e)}
         

            const fileResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileID}/content`, {
                headers: {'Authorization': `Bearer ${accessToken}`,  },
            }).catch( err => {log.error(err)});

            try {
                const fileBuffer = await fileResponse.arrayBuffer();
                fs.writeFileSync(join(studentarchivedir, fileName), Buffer.from(fileBuffer));
            } catch (e) {log.error(e)}

            const pdfFileResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileID}/content?format=pdf`, {
                headers: {'Authorization': `Bearer ${accessToken}`,  },
            }).catch( err => {log.error(err)});

            if (pdfFileResponse.ok) {
                const pdfFileBuffer = await pdfFileResponse.arrayBuffer();
                const pdfFilePath = join(studentarchivedir, `${fileName}.pdf`);
                try {
                    fs.writeFileSync(pdfFilePath, Buffer.from(pdfFileBuffer));
                    log.info(`Downloaded ${fileName} and ${fileName}.pdf`);
                } catch (e) {log.error(e)}  
            }
            else {
                log.error("there was a problem downloading the files as pdf")
            }
            
        })



    }

    isPdfUrl(url) {
        let pdf = false
        try {
           pdf =  url.toLowerCase().endsWith('.pdf');
        }
        catch (err) {
            log.info(`ipchandler: isPdfUrl: ${err}`) 
        }
        return pdf
    }

    copyConfig(conf) {
        let configCopy = {
            development: conf.development, 
            showdevtools: conf.showdevtools,
            bipIntegration: conf.bipIntegration,
            bipDemo: conf.bipDemo,
            workdirectory: conf.workdirectory,
            tempdirectory: conf.tempdirectory,
            serverdirectory: conf.serverdirectory,
           
            serverApiPort: conf.serverApiPort,
            multicastClientPort: conf.multicastClientPort,
            multicastServerClientPort: conf.multicastServerClientPort,
           
            multicastServerAdrr: conf.multicastServerAdrr,
            hostip: conf.hostip,
            gateway: conf.gateway,
            accessToken: conf.accessToken,
            version: conf.version,
            info: conf.info,
            buildforWEB: conf.buildforWEB
          };
        return configCopy
    }
}

export default new IpcHandler()
