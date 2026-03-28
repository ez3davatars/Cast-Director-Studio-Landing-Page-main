const fs = require('fs');
const path = './components/AccountDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('downloadGroups.get(identityStr).push(d);', 'downloadGroups.get(identityStr)!.push(d);');

fs.writeFileSync(path, content);
console.log('Fixed TS error');
