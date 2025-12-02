import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import log from 'electron-log';

const execAsync = promisify(exec);

// Convert RSSI in dBm to a quality percentage between 0 and 100.
function dbmToQualityPercent(dbm) {
    if (dbm === null || Number.isNaN(dbm)) return null;
    const minDbm = -100;
    const maxDbm = -30;
    const clamped = Math.max(minDbm, Math.min(maxDbm, dbm));
    const percent = ((clamped - minDbm) / (maxDbm - minDbm)) * 100;
    return Math.round(percent);
}

/**
 * Get current WLAN information (SSID, BSSID, Quality)
 * @returns {Promise<{ssid: string|null, bssid: string|null, quality: number|null}>}
 */
export async function getWlanInfo() {
    try {
        const platform = os.platform();
        
        switch (platform) {
            case 'linux':
                return await getWlanInfoLinux();
            case 'win32':
                return await getWlanInfoWindows();
            case 'darwin':
                return await getWlanInfoMacOS();
            default:
                return { ssid: null, bssid: null, quality: null };
        }
    } catch (error) {
        // Return empty object instead of throwing to prevent app crash
        return { ssid: null, bssid: null, quality: null };
    }
}

/**
 * Get WLAN info on Linux using nmcli (with fallback to iw/iwconfig)
 */
async function getWlanInfoLinux() {
    try {
        // Try nmcli first (most common on modern Linux)
        // First try to get active device directly (faster than listing all networks)
        try {
            const { stdout } = await execAsync('nmcli -t -f active,ssid,bssid,signal device wifi list', {
                timeout: 4000,
                maxBuffer: 1024 * 64
            });
            if (!stdout) {
                throw new Error('No output from nmcli');
            }
            const lines = stdout.trim().split('\n');
            
            // Find active connection
            for (const line of lines) {
                const parts = line.split(':');
                if ((parts[0] === 'yes' || parts[0] === 'ja') && parts.length >= 4) {
                    const ssid = parts[1] || '';
                    // BSSID is a MAC address (6 hex bytes separated by colons, possibly escaped)
                    // Extract BSSID using regex - handle escaped colons (\:) as shown in nmcli output
                    // In regex string, \\: matches a literal backslash followed by colon
                    const bssidMatch = line.match(/[a-f0-9]{2}(?:\\:[a-f0-9]{2}){5}/i);
                    let bssid = null;
                    if (bssidMatch) {
                        // Remove escape backslashes and normalize to uppercase
                        bssid = bssidMatch[0].replace(/\\:/g, ':').toUpperCase();
                    } else {
                        // Fallback: try normal colons
                        const normalMatch = line.match(/[a-f0-9]{2}(?::[a-f0-9]{2}){5}/i);
                        if (normalMatch) {
                            bssid = normalMatch[0].toUpperCase();
                        } else {
                            bssid = parts[2] || '';
                        }
                    }
                    // Signal is the last numeric part
                    const signalStr = parts[parts.length - 1] ? parts[parts.length - 1].trim() : '';
                    const signal = signalStr ? (parseInt(signalStr, 10) || null) : null;
                    
                    return {
                        ssid: ssid || null,
                        bssid: bssid || null,
                        quality: signal
                    };
                }
            }
        } catch (nmcliError) {
            // Only log if it's a real error (command not found, timeout, etc.), not if just no WLAN active
            const isRealError = nmcliError.code === 'ENOENT' || nmcliError.code === 'ETIMEDOUT' || 
                                (nmcliError.message && !nmcliError.message.includes('No output'));
            if (isRealError) {
                log.error('getWlanInfoLinux: nmcli command failed:', nmcliError.message || nmcliError);
            }
            
            // Fallback to iw (iwconfig is deprecated but still available on some systems)
            try {
                const { stdout: iwStdout } = await execAsync('iw dev | grep -E "^\s*ssid|^\s*link"', {
                    timeout: 2000,
                    maxBuffer: 1024 * 64
                });
                const { stdout: iwlinkStdout } = await execAsync('iw dev | grep -A 5 "^\s*link"', {
                    timeout: 2000,
                    maxBuffer: 1024 * 64
                });
                
                // Extract SSID
                const ssidMatch = iwStdout ? iwStdout.match(/ssid\s+(.+)/) : null;
                const ssid = ssidMatch ? ssidMatch[1].trim() : null;
                
                // Extract BSSID and signal from link info
                const bssidMatch = iwlinkStdout ? iwlinkStdout.match(/addr:\s+([a-f0-9:]{17})/i) : null;
                const bssid = bssidMatch ? bssidMatch[1].toUpperCase() : null;
                
                const signalMatch = iwlinkStdout ? iwlinkStdout.match(/signal:\s+(-?\d+)/) : null;
                const signalDbm = signalMatch ? (parseInt(signalMatch[1], 10) || null) : null;
                const quality = signalDbm !== null ? dbmToQualityPercent(signalDbm) : null;
                
                return {
                    ssid,
                    bssid,
                    quality
                };
            } catch (iwError) {
                // Only log if it's a real error
                const isRealError = iwError.code === 'ENOENT' || iwError.code === 'ETIMEDOUT';
                if (isRealError) {
                    log.error('getWlanInfoLinux: iw command failed:', iwError.message || iwError);
                }
                
                // Last fallback: iwconfig (deprecated but widely available)
                try {
                    const { stdout } = await execAsync('iwconfig 2>/dev/null | grep -E "ESSID|Access Point|Signal level"', {
                        timeout: 2000,
                        maxBuffer: 1024 * 64
                    });
                    const lines = stdout.split('\n');
                    
                    let ssid = null;
                    let bssid = null;
                    let signal = null;
                    
                    for (const line of lines) {
                        const ssidMatch = line.match(/ESSID:"([^"]+)"/);
                        if (ssidMatch) ssid = ssidMatch[1];
                        
                        const bssidMatch = line.match(/Access Point:\s+([a-f0-9:]{17})/i);
                        if (bssidMatch) bssid = bssidMatch[1].toUpperCase();
                        
                        const signalMatch = line.match(/Signal level=(-?\d+)/);
                        if (signalMatch) {
                            const parsed = parseInt(signalMatch[1], 10);
                            signal = isNaN(parsed) ? null : parsed;
                        }
                    }
                    
                    return {
                        ssid,
                        bssid,
                        quality: dbmToQualityPercent(signal)
                    };
                } catch (iwconfigError) {
                    // Only log if all methods failed with real errors (command not found, timeout)
                    const isRealError = iwconfigError.code === 'ENOENT' || iwconfigError.code === 'ETIMEDOUT';
                    if (isRealError) {
                        log.error('getWlanInfoLinux: All methods (nmcli, iw, iwconfig) failed. Last error:', iwconfigError.message || iwconfigError);
                    }
                }
            }
        }
    } catch (error) {
        // Log unexpected errors during WLAN info retrieval
        log.error('getWlanInfoLinux: Unexpected error:', error.message || error);
    }
    
    return {
        ssid: null,
        bssid: null,
        quality: null
    };
}

/**
 * Get WLAN info on Windows using netsh
 */
async function getWlanInfoWindows() {
    try {
        const { stdout, stderr } = await execAsync('netsh wlan show interfaces', {
            timeout: 5000,
            maxBuffer: 1024 * 64
        });
        
        // Check stderr for service errors
        const errorOutput = (stderr || '').toLowerCase();
        const output = (stdout || '').toLowerCase();
        const combinedOutput = output + ' ' + errorOutput;
        
        // Check if WLAN service is not running (various language versions)
        if (combinedOutput.includes('wlansvc') || 
            combinedOutput.includes('wlan autoconfig') ||
            combinedOutput.includes('automatisch wlan') ||
            combinedOutput.includes('wlan-konfiguration') ||
            combinedOutput.includes('wird nicht ausgeführt') ||
            combinedOutput.includes('is not running') ||
            combinedOutput.includes('service is not running') ||
            combinedOutput.includes('der dienst') && combinedOutput.includes('wird nicht ausgeführt')) {
            return { ssid: null, bssid: null, quality: null };
        }
        
        if (!stdout || stdout.trim().length === 0) {
            return { ssid: null, bssid: null, quality: null };
        }
        
        // Check if there are no interfaces available
        if (stdout.includes('There is no wireless interface') || 
            stdout.includes('Es gibt keine Drahtlos-Schnittstelle') ||
            stdout.match(/No wireless/i)) {
            return { ssid: null, bssid: null, quality: null };
        }
        
        const lines = stdout.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        let ssid = null;
        let bssid = null;
        let signal = null;
        
        for (const line of lines) {
            // SSID parsing - more flexible, handles various formats
            if (line.match(/SSID\s*:/i)) {
                const match = line.match(/SSID\s*:\s*(.+)/i);
                if (match) {
                    const extracted = match[1].trim();
                    // Only set if not empty and not "N/A" or similar
                    if (extracted && extracted.length > 0 && !extracted.match(/^(N\/A|n\/a|none|keine)$/i)) {
                        ssid = extracted;
                    }
                }
            }
            // BSSID parsing - more flexible pattern matching
            else if (line.match(/BSSID\s*:/i)) {
                // Extract MAC address pattern (handles both - and : separators, with or without spaces)
                const match = line.match(/BSSID\s*:\s*([a-f0-9]{2}(?:[-:\s][a-f0-9]{2}){5})/i);
                if (match) {
                    bssid = match[1].replace(/[- ]/g, ':').toUpperCase();
                }
            }
            // Signal parsing - handle various localized formats and patterns
            else if (line.match(/Signal|Signalstärke|Intensité|Señal/i)) {
                // Try percentage pattern first (most common)
                let match = line.match(/:\s*(\d+)\s*%/i);
                if (match) {
                    const parsed = parseInt(match[1], 10);
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                        signal = parsed;
                    }
                } else {
                    // Try dBm pattern (negative value)
                    match = line.match(/:\s*(-?\d+)\s*dBm/i);
                    if (match) {
                        const dbm = parseInt(match[1], 10);
                        if (!isNaN(dbm)) {
                            signal = dbmToQualityPercent(dbm);
                        }
                    }
                }
            }
        }
        
        // Normalize empty strings to null
        return {
            ssid: (ssid && ssid.length > 0) ? ssid : null,
            bssid: (bssid && bssid.length > 0) ? bssid : null,
            quality: signal
        };
    } catch (error) {
        // Log error when command execution fails (timeout, permission, etc.)
        log.error('getWlanInfoWindows: Error executing netsh command:', error.message || error);
        return { ssid: null, bssid: null, quality: null };
    }
}

/**
 * Get WLAN info on macOS using airport or networksetup
 */
async function getWlanInfoMacOS() {
    try {
        // Try airport command first (requires sudo or proper permissions)
        try {
            // Check if airport is available (usually at /System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport)
            const { stdout: airportPath } = await execAsync('which airport 2>/dev/null || echo /System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport', {
                timeout: 1000,
                maxBuffer: 1024 * 64
            });
            const airport = airportPath.trim();
            
            const { stdout } = await execAsync(`${airport} -I`, {
                timeout: 2000,
                maxBuffer: 1024 * 64
            });
            const lines = stdout.split('\n').map(line => line.trim());
            
            let ssid = null;
            let bssid = null;
            let rssiDbm = null;
            let signalPercent = null;
            
            for (const line of lines) {
                if (line.startsWith('SSID:')) {
                    ssid = line.replace('SSID:', '').trim();
                } else if (line.startsWith('BSSID:')) {
                    // Extract MAC address pattern to ensure we get the full BSSID
                    const bssidMatch = line.match(/BSSID:\s*([a-f0-9]{2}(?::[a-f0-9]{2}){5})/i);
                    bssid = bssidMatch ? bssidMatch[1].toUpperCase() : null;
                } else if (line.startsWith('agrCtlRSSI:')) {
                    // RSSI in dBm (negative value)
                    const rssiStr = line.replace('agrCtlRSSI:', '').trim();
                    const rssi = rssiStr ? (parseInt(rssiStr, 10) || null) : null;
                    rssiDbm = rssi;
                } else if (line.startsWith('link auth:')) {
                    // Alternative: signal strength as percentage (if available)
                    const signalMatch = line.match(/(\d+)%/);
                    if (signalMatch && signalPercent === null) {
                        const parsed = parseInt(signalMatch[1], 10);
                        signalPercent = isNaN(parsed) ? null : parsed;
                    }
                }
            }
            
            let quality = null;
            if (signalPercent !== null) {
                quality = signalPercent;
            } else if (rssiDbm !== null) {
                quality = dbmToQualityPercent(rssiDbm);
            }
            
            if (ssid || bssid || quality !== null) {
                return {
                    ssid: ssid || null,
                    bssid: bssid || null,
                    quality
                };
            }
        } catch (airportError) {
            // Fallback to networksetup - only log if it's a real error (not just no permission)
            if (airportError.code !== 'ENOENT' && airportError.message && !airportError.message.includes('permission')) {
                log.error('getWlanInfoMacOS: airport command failed:', airportError.message || airportError);
            }
        }
        
        // Fallback: networksetup (more reliable, no special permissions needed)
        try {
            const { stdout: currentInterface } = await execAsync('networksetup -listallhardwareports | grep -A 1 "Wi-Fi" | grep "Device:" | awk \'{print $2}\'', {
                timeout: 2000,
                maxBuffer: 1024 * 64
            });
            const interfaceName = currentInterface.trim();
            
            if (!interfaceName) {
                // No Wi-Fi interface is not an error, just return null
                return { ssid: null, bssid: null, quality: null };
            }
            
            const { stdout: info } = await execAsync(`networksetup -getairportnetwork "${interfaceName}"`, {
                timeout: 2000,
                maxBuffer: 1024 * 64
            });
            // Match any text before colon followed by SSID (works for "Current Wi-Fi Network:" and localized versions)
            const ssidMatch = info.match(/:\s*(.+)/);
            const ssid = ssidMatch ? ssidMatch[1].trim() : null;
            
            // Get BSSID and signal using system_profiler (alternative method)
            try {
                const { stdout: profilerOut } = await execAsync('system_profiler SPAirPortDataType | grep -A 10 -i "network information"', {
                    timeout: 3000,
                    maxBuffer: 1024 * 128
                });
                // Match MAC Address in any language (look for pattern: text : MAC address format)
                const bssidMatch = profilerOut.match(/:\s*([a-f0-9]{2}(?::[a-f0-9]{2}){5})/i);
                const bssid = bssidMatch ? bssidMatch[1].toUpperCase() : null;
                
                // Signal strength might not be available via system_profiler
                return {
                    ssid,
                    bssid,
                    quality: null
                };
            } catch (profilerError) {
                // system_profiler failure is not critical, just return what we have
                return {
                    ssid,
                    bssid: null,
                    quality: null
                };
            }
        } catch (networksetupError) {
            // Log error if networksetup fails with a real error
            log.error('getWlanInfoMacOS: networksetup command failed:', networksetupError.message || networksetupError);
        }
    } catch (error) {
        // Log unexpected errors during WLAN info retrieval
        log.error('getWlanInfoMacOS: Unexpected error:', error.message || error);
    }
    
    return { ssid: null, bssid: null, quality: null };
}

export default { getWlanInfo };


