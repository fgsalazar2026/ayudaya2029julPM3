const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, 'version.json');
const data = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));

const parts = process.argv.slice(2);
const bumpType = parts[0] || 'patch';

if (bumpType === 'major') {
    data.major += 1;
    data.minor = 0;
    data.patch = 0;
} else if (bumpType === 'minor') {
    data.minor += 1;
    data.patch = 0;
} else {
    data.patch += 1;
}

data.version = `${data.major}.${data.minor}.${data.patch}`;
data.lastUpdated = new Date().toISOString();

const { execSync } = require('child_process');
try {
    const lastCommit = execSync('git log --oneline -1').toString().trim().split(' ')[0];
    data.lastCommit = lastCommit;
} catch (e) {
    data.lastCommit = 'unknown';
}

fs.writeFileSync(versionFile, JSON.stringify(data, null, 2));
console.log(`Version bumped to ${data.version}`);