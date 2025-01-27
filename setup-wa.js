const whatsappService = require('./config/whatsapp-baileys');
const QRCode = require('qrcode-terminal');

console.log('\n=== WHATSAPP SETUP ===\n');
console.log('Initializing WhatsApp...');

// Handle QR Code
whatsappService.onQR((qr) => {
    console.log('\nScan QR code berikut dengan WhatsApp Anda:');
    QRCode.generate(qr, { small: true });
});

// Handle Connection
whatsappService.onConnection((connected) => {
    if (connected) {
        console.log('\n✅ WhatsApp berhasil terhubung!');
        console.log('\nAnda bisa menutup terminal ini.');
        // Optional: process.exit(0);
    } else {
        console.log('\n❌ WhatsApp terputus, mencoba menghubungkan ulang...');
    }
});

// Initialize WhatsApp
whatsappService.initialize().catch(error => {
    console.error('Error:', error);
    process.exit(1);
}); 