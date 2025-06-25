import { execSync } from 'child_process'

const suspiciousKeywords = [
  'teamviewer', 'anydesk', 'rustdesk', 'vnc',
  'chromeremotedesktop', 'splashtop', 'dwagent',
  'logmein', 'screenconnect', 'zoho', 'parallels',
  'remoteutilities', 'g2comm','pcvisit', 'pcvisit_support', 'pcvisit_customer', 'support 15'
]


const suspiciousPorts = [
  53, 443, 2002, 5222, 5650, 5900, 5901, 5902, 5938,
  7070, 6783, 6784, 6785, 8040, 8041, 8042, 21115, 21116
];

function checkProcesses() {
  try {
    const out = execSync('ps aux', { encoding: 'utf8' }).toLowerCase()
    return suspiciousKeywords.some(k => out.includes(k))
  } catch {
    return false
  }
}

function checkPorts() {
  try {
    const out = execSync('lsof -i -n -P', { encoding: 'utf8' }).toLowerCase()
    return suspiciousPorts.some(p => out.includes(`:${p}`))
  } catch {
    return false
  }
}

export function runRemoteCheck() {
  return checkProcesses() || checkPorts()
}
