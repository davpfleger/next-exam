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


import { exec } from 'child_process'                          // run tccutil
import { dialog, app } from 'electron'                         // show dialog and quit
import log from 'electron-log';




export async function testNetworkPermission() {                // returns true if fetch works
    try {
            const res = await fetch('https://example.com', { method: 'GET', cache: 'no-store' }) // test request
            return res.ok
    } catch {  return false }
}

export async function resetTCC() {      // reset TCC permissions
    return new Promise((resolve, reject) => {
        //appId
        exec(`tccutil reset All com.nextexam.student`, (err, stdout, stderr) => {
            if (err) return reject({ err, stdout, stderr })
            resolve({ stdout, stderr })
        })
        //appBundleId (set via notarize)
        exec(`tccutil reset All com.nextexam-student.app`, (err, stdout, stderr) => {
            if (err) return reject({ err, stdout, stderr })
            resolve({ stdout, stderr })
        })


    })
}

export async function ensureNetworkOrReset() { // check or reset
    const ok = await testNetworkPermission()
    if (ok) {
            log.info(`testpermissionsMac @ ensureNetworkOrReset: Network access is allowed`);
            return true
    }
    log.warn(`testpermissionsMac @ ensureNetworkOrReset: No HTTP requests allowed!` )

    try {
        await resetTCC()
        await dialog.showMessageBox({
            type: 'info',
            message: 'Permissions reset',
            detail: 'Berechtigungen wurden zurückgesetzt. Bitte starten sie Next-Exam neu!',
            buttons: ['OK'],
        }).then(({ response }) => {
           
            app.quit()
        })
        return true
    } 
    catch (e) {
        await dialog.showMessageBox({
            type: 'error',
            message: 'Failed to reset permissions',
            detail: String(e.err || e),
        })
        return false
    }
}
