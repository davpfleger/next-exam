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
  const foundKeywords = [] // Array to store found keywords

  try {
    const out = execSync('ps aux', { encoding: 'utf8' }).toLowerCase() 
    
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
  // Ports are formatted as :PORT (e.g., :5938 ) in lsof output
  const correctlyFormattedPorts = suspiciousPorts.map(p => `:${p} `); 

  try {
    const out = execSync('lsof -i -n -P', { encoding: 'utf8' }).toLowerCase() 
    
    for (let i = 0; i < correctlyFormattedPorts.length; i++) {
      const formattedPort = correctlyFormattedPorts[i]
      const originalPort = suspiciousPorts[i]
      
      if (out.includes(formattedPort)) {
        foundPorts.push(originalPort)
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