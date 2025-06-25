
import os from 'os';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { spawn } from 'child_process';
import { app } from 'electron';
import log from 'electron-log';
import platformDispatcher from './platformDispatcher.js';


const __dirname = import.meta.dirname;

 // every platform needs it's own jre (linux, win32, darwin) //fixme: use GraalVM to precompile languagetool in order to save space and get rid of jre?
class JreHandler {
    constructor () { }

    init(){ }

    fail(reason) {
        log.error(reason);
        process.exit(1);
    }

    getDirectories(dirPath) {
        let dirs = fs.readdirSync(dirPath).filter(
            file => fs.statSync(path.join(dirPath, file)).isDirectory()
        );
        return dirs
    } 

    driver(){
        var d = platformDispatcher.javaBin.slice();
        d.unshift(platformDispatcher.jreDir);
        return path.join.apply(path, d);
    }

    getArgs(classpath, classname, args) {
        args = (args || []).slice();
        classpath = classpath || [];
        args.unshift(classname);
        args.unshift(classpath.join(this._platform === 'win32' ? ';' : ':'));
        args.unshift('-cp');
        return args;
    }

    jSpawn(classpath, classname, args) {
        
        let javapath = this.driver()
        let javaargs = this.getArgs(classpath, classname, args)
        let javacmdline =  `${javapath} ${javaargs.join(' ')} `

        log.info(`jre-handler @ jSpawn: '${platformDispatcher.jre}' selected`)
        log.info(`jre-handler @ jSpawn: spawning java process: ${javacmdline}`)
        return spawn(javapath, javaargs, {shell:false});
       // return spawn(javacmdline);
    }
}


export default new JreHandler()
