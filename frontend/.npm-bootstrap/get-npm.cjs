const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NPM_TGZ_URL = 'https://registry.npmjs.org/npm/-/npm-10.9.2.tgz';
const DEST_DIR = 'E:\\heloo\\frontend\\.npm-bootstrap';
const TAR_PATH = path.join(DEST_DIR, 'npm.tgz');
const EXTRACT_DIR = path.join(DEST_DIR, 'package');

if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });

function download(url, dest, cb) {
  const file = fs.createWriteStream(dest);
  function get(u) {
    https.get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        get(res.headers.location);
      } else {
        res.pipe(file);
        file.on('finish', () => { file.close(); cb(); });
      }
    }).on('error', (e) => { console.error('Download error:', e.message); process.exit(1); });
  }
  get(url);
}

console.log('Downloading npm 10.9.2...');
download(NPM_TGZ_URL, TAR_PATH, () => {
  console.log('Downloaded. Extracting...');
  try {
    execSync('tar -xzf "' + TAR_PATH + '" -C "' + DEST_DIR + '"', { stdio: 'inherit' });
    console.log('Extracted to:', EXTRACT_DIR);
    console.log('npm CLI at:', path.join(EXTRACT_DIR, 'bin', 'npm-cli.js'));
  } catch (e) {
    console.error('tar failed:', e.message);
    process.exit(1);
  }
});
