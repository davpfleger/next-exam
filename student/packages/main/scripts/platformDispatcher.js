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


// this file is used to store the config for the environment
// it queries the environment variables and the platform and sets the config accordingly



import { execSync } from 'child_process';
import { join } from 'path';
import { app } from 'electron';
import log from 'electron-log';
import config from '../config.js';
import { pathToFileURL } from 'url';
const __dirname = import.meta.dirname;



class EnvironmentConfig {
  constructor() {

    this._platform = process.platform;
    this._arch = process.arch;
    this._env = process.env;

    log.warn(`platformDispatcher: -------------------`)
    log.warn(`platformDispatcher: starting Next-Exam Student "${config.version} ${config.info}" (${process.platform})`)
    log.warn(`platformDispatcher: -------------------`)
 

  
    this.arch = this._normalizeArch();
    this.displayServer = this.getDisplayServer();
    this.flameshot = this.getVersion('flameshot');
    this.imagemagick = this.getVersion('convert');
    this.imVersion = null // set in _imagemagickAvailable()

    this.useWorker = null; // set in _setupScreenshotAndWorker()
    this.screenshotAbility = null; // set in _setupScreenshotAndWorker()

    this.jre = this._detectJREId();
    this.jreDir = this._resolveJREDir();
    this.javaBin = this._resolveJavaBin();
    this.jreInfo = this.getJRE();

  
    this._setupScreenshotAndWorker();




    

  }



  _normalizeArch() {
    if (this._arch === 'ia32') return 'i586';
    if (['x64', 'arm64'].includes(this._arch)) return this._arch;
    this._fail(`unsupported architecture: ${this._arch}`);
  }

  _detectJREId() {
    if (this._platform === 'linux') return 'minimal-jre-11-lin';
    if (this._platform === 'win32') return 'minimal-jre-11-win';
    if (this._platform === 'darwin') {
      return this._arch === 'arm64' ? 'minimal-jre-11-mac-arm64' : 'minimal-jre-11-mac';
    }
  }

  _resolveJREDir() {
    if (app.isPackaged) {
      return join(process.resourcesPath, 'app.asar.unpacked', 'public', this.jre);
    } else {
      return join(__dirname, '../../public', this.jre);
    }
  }

  _resolveJavaBin() {
    switch (this._platform) {
      case 'darwin': return ['bin', 'java'];
      case 'win32': return ['bin', 'javaw.exe'];
      case 'linux': return ['bin', 'java'];
      default: this._fail(`unsupported platform: ${this._platform}`);
    }
  }

  getDisplayServer() {
    if (this._platform !== 'linux') return 'n/a';
    if (this._env.XDG_SESSION_TYPE === 'wayland') return 'wayland';
    if (this._env.XDG_SESSION_TYPE === 'x11' || this._env.DISPLAY) return 'x11';
    return 'unknown';
  }

  getVersion(cmd) {
    try {
      const output = execSync(`${cmd} --version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).split('\n')[0];
      const version = output.match(/[\d]+(\.[\d]+)+/);
      return { found: true, version: version?.[0] || 'unknown' };
    } catch {
      return { found: false, version: null };
    }
  }

  getJRE() {
    try {
      const output = execSync('java -version', { encoding: 'utf-8', stdio: ['pipe', 'ignore', 'pipe'] });
      const version = output.match(/version "([\d._]+)"/)?.[1] || 'unknown';
      const javaHome = this._env.JAVA_HOME || '';
      return { found: true, version, path: javaHome };
    } catch {
      return { found: false, version: null, path: null };
    }
  }

  _setupScreenshotAndWorker() {
    if (this._platform === 'linux') {
      this.useWorker = this._imagemagickAvailable();
      if ((this._isGNOME() || this._isUNITY()) && this.isWayland()) {
        this.screenshotAbility = false;
        log.info("platformDispatcher @ _setupScreenshotAndWorker: GNOME/Unity + Wayland – ScreenshotAbility set to false");
      } else if (this._isKDE() && this.isWayland() && this._flameshotAvailable()) {
        this.screenshotAbility = true;
        log.info("platformDispatcher @ _setupScreenshotAndWorker: KDE/Wayland + Flameshot – ScreenshotAbility set to true");
      } else if (!this.isWayland() && this.useWorker) {
        this.screenshotAbility = true;
        log.info("platformDispatcher @ _setupScreenshotAndWorker: X11 + ImageMagick – ScreenshotAbility set to true");
      } else {
        this.screenshotAbility = false;
        log.info("platformDispatcher @ _setupScreenshotAndWorker: ScreenshotAbility set to false – fallback to pagecapture");
      }
    } else {
      this.useWorker = true;
      this.screenshotAbility = true;
    }
  
    // Worker-Logik direkt anschließen
    const workerFileName = this._platform === 'linux' ? 'imageWorkerLinux.mjs' : 'imageWorkerSharp.js';
    const baseDir = app.isPackaged ? process.resourcesPath : import.meta.dirname;
    const workerPath = app.isPackaged
      ? join(baseDir, 'app.asar.unpacked', 'public', workerFileName)
      : join(baseDir, '../../public', workerFileName);
  
    this.workerURL = pathToFileURL(workerPath);
  }

  isWayland() {
    return this._env.XDG_SESSION_TYPE === 'wayland';
  }

  _isKDE() {
    try {
      const out = execSync('echo $XDG_CURRENT_DESKTOP', { shell: '/bin/bash', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      return out === 'KDE';
    } catch {
      log.warn("platformDispatcher @ _isKDE: no data");
      return false;
    }
  }

  _isGNOME() {
    try {
      const out = execSync('echo $XDG_CURRENT_DESKTOP', { shell: '/bin/bash', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().toLowerCase();
      return out.includes('gnome');
    } catch (err) {
      log.warn("platformDispatcher @ _isGNOME: no data", err);
      return false;
    }
  }

  _isUNITY() {
    try {
      const out = execSync('echo $XDG_CURRENT_DESKTOP', { shell: '/bin/bash', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().toLowerCase();
      return out.includes('unity');
    } catch (err) {
      log.warn("platformDispatcher @ _isUNITY: no data", err);
      return false;
    }
  }

  _imagemagickAvailable() {
    try {
      execSync("magick -version", { stdio: 'ignore' });
      this.imVersion = "7";
      log.info("platformDispatcher @ _imagemagickAvailable: Found ImageMagick v7 (magick)");
      return true;
    } catch {
      try {
        execSync("which import", { stdio: 'ignore' });
        this.imVersion = "<7";
        log.info("platformDispatcher @ _imagemagickAvailable: Found ImageMagick <7 (import)");
        return true;
      } catch (err) {
        log.error("platformDispatcher @ _imagemagickAvailable: ImageMagick not found", err);
        return false;
      }
    }
  }

  _flameshotAvailable() {
    try {
      execSync("which flameshot", { stdio: 'ignore' });
      return true;
    } catch {
      log.error("platformDispatcher @ _flameshotAvailable: Flameshot not found");
      return false;
    }
  }

  _fail(msg) {
      throw new Error(`[platformDispatcher] ${msg}`);
  }
}

const environmentConfig = new EnvironmentConfig();
export default environmentConfig;
