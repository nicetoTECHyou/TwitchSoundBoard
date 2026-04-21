// =============================================
// TwitchSoundBoard – Build Script
// Erstellt eine Zip-Datei des Projekts
// =============================================

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT_DIR = __dirname;
const DOWNLOAD_DIR = path.join(ROOT_DIR, 'download');
const VERSION_FILE = path.join(ROOT_DIR, 'VERSION');

// Version auslesen
function getVersion() {
  return fs.readFileSync(VERSION_FILE, 'utf-8').trim();
}

// Version bumpen
function bumpVersion() {
  const current = getVersion();
  const parts = current.split('.');
  parts[2] = parseInt(parts[2]) + 1;
  const newVersion = parts.join('.');
  fs.writeFileSync(VERSION_FILE, newVersion + '\n', 'utf-8');

  // package.json aktualisieren
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  // CHANGELOG aktualisieren
  const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  const newEntry = `\n## [${newVersion}] – ${today}\n\n### Changed\n- Version bump von ${current} auf ${newVersion}\n`;
  fs.writeFileSync(changelogPath, newEntry + changelog, 'utf-8');

  console.log(`✅ Version: ${current} → ${newVersion}`);
  return newVersion;
}

// Zip erstellen
function createZip(version) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }

    const zipFileName = `TwitchSoundBoard-v${version}.zip`;
    const zipFilePath = path.join(DOWNLOAD_DIR, zipFileName);

    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeKB = (archive.pointer() / 1024).toFixed(1);
      console.log(`✅ Zip erstellt: ${zipFileName} (${sizeKB} KB)`);
      resolve(zipFilePath);
    });

    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    // Dateien und Ordner zum Zip hinzufügen
    const includeFiles = [
      'server.js',
      'package.json',
      'config.json',
      '.env.example',
      '.gitignore',
      '.gitattributes',
      'README.md',
      'CHANGELOG.md',
      'VERSION',
      'start.bat',
      'build.js'
    ];

    const includeDirs = [
      'public',
      'sounds',
      'videos'
    ];

    for (const file of includeFiles) {
      const filePath = path.join(ROOT_DIR, file);
      if (fs.existsSync(filePath)) {
        // .bat Dateien MUESSEN CRLF Zeilenenden haben fuer Windows
        if (file.endsWith('.bat')) {
          let content = fs.readFileSync(filePath, 'utf-8');
          content = content.replace(/\r?\n/g, '\r\n');
          archive.append(content, { name: file });
        } else {
          archive.file(filePath, { name: file });
        }
      }
    }

    for (const dir of includeDirs) {
      const dirPath = path.join(ROOT_DIR, dir);
      if (fs.existsSync(dirPath)) {
        archive.directory(dirPath, dir);
      }
    }

    // Leere sounds/README damit der Ordner in der Zip existiert
    archive.append('# Lege hier deine Sounddateien ab (.mp3, .wav, .ogg)', { name: 'sounds/README.txt' });
    archive.append('# Lege hier deine Videodateien ab (.mp4, .webm)', { name: 'videos/README.txt' });

    archive.finalize();
  });
}

// Hauptprogramm
async function main() {
  const doBump = process.argv.includes('--bump');

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  TwitchSoundBoard Build Script');
  console.log('═══════════════════════════════════════');
  console.log('');

  let version = getVersion();

  if (doBump) {
    console.log(`Aktuelle Version: ${version}`);
    version = bumpVersion();
  } else {
    console.log(`Version: ${version}`);
  }

  console.log('Erstelle Zip-Archiv...');
  await createZip(version);

  console.log('');
  console.log('Fertig! ✅');
  console.log('');
}

main().catch(err => {
  console.error('Build-Fehler:', err.message);
  process.exit(1);
});
