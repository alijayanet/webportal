const fs = require('fs');
const readline = require('readline');
const settings = require('./config/settings');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function setupConfig() {
    console.log('\n=== WEBPORTAL SETUP ===\n');

    // Business Info
    settings.business.name = await question('Nama Bisnis: ');
    settings.business.phone = await question('Nomor Telepon Bisnis: ');

    // Primary Server
    console.log('\n=== SERVER UTAMA ===');
    settings.servers.primary.url = await question('URL GenieACS: ');
    settings.servers.primary.username = await question('Username: ');
    settings.servers.primary.password = await question('Password: ');

    // WhatsApp
    console.log('\n=== WHATSAPP GATEWAY ===');
    settings.whatsapp.apiKey = await question('API Key: ');
    settings.whatsapp.sender = await question('Nomor Pengirim: ');
    const admins = await question('Nomor Admin (pisahkan dengan koma): ');
    settings.whatsapp.admins = admins.split(',').map(a => a.trim());

    // Save config
    fs.writeFileSync(
        './config/settings.js', 
        `module.exports = ${JSON.stringify(settings, null, 4)};`
    );

    console.log('\nKonfigurasi berhasil disimpan!');
    console.log('\nLangkah selanjutnya:');
    console.log('1. npm install');
    console.log('2. pm2 start app.js --name webportal');
    
    rl.close();
}

function question(q) {
    return new Promise(resolve => rl.question(q, resolve));
}

setupConfig(); 