import { execSync } from 'child_process'

const suspiciousKeywords = [
  'teamviewer', 'anydesk', 'rustdesk', 'vnc', 'zoom', 'discord', 'skype', 'teams',
  'chromeremotedesktop', 'splashtop', 'dwagent',
  'logmein', 'screenconnect', 'zoho', 'parallels',
  'remoteutilities', 'g2comm', 'pcvisit', 'pcvisit_support', 'pcvisit_customer', 'support 15'
]

const suspiciousPorts = [
  53, 2002, 5222, 5650, 5900, 5901, 5902, 5938,
  7070, 6783, 6784, 6785, 8040, 8041, 8042, 21115, 21116
];

function checkProcesses() {
  const foundKeywords = []

  try {
    // Execute 'tasklist /v' and convert output to lowercase
    const out = execSync('tasklist /v', { encoding: 'utf8' }).toLowerCase() 
    
    for (const keyword of suspiciousKeywords) {
      if (out.includes(keyword)) {
        foundKeywords.push(keyword)
      }
    }
    
    return foundKeywords
  } catch (error) {
    return []
  }
}

function checkPorts() {
  const foundPorts = []

  try {
    // Execute 'netstat -ano'
    const out = execSync('netstat -ano', { encoding: 'utf8' }) 
    
    for (const port of suspiciousPorts) {
      // Regex to find :PORT followed by a space (ensures exact port match, e.g., :5938 )
      const regex = new RegExp(`:${port}\\s`, 'g') 
      if (regex.test(out)) {
        foundPorts.push(port)
      }
    }
    
    return foundPorts
  } catch (error) {
    return []
  }
}

export function runRemoteCheck() {
  const foundKeywords = checkProcesses()
  const foundPorts = checkPorts()

  if (foundKeywords.length === 0 && foundPorts.length === 0) { 
    return false
  }

  return { // Return found keywords and ports
    keywords: foundKeywords,
    ports: foundPorts,
  }
}