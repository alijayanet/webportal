// Konfigurasi Aplikasi
const settings = {
    // Informasi Bisnis
    business: {
        name: 'ALIJAYA JURAGAN PULSA & WIFI HOTSPOT',
        phone: '0878-2085-1413',
        footer: 'Info & Pembayaran: 0878-2085-1413'
    },

    // Server GenieACS
    servers: {
        primary: {
            name: 'Server Utama',
            url: 'http://192.168.8.89:7557',
            username: 'alijaya',
            password: '087828060111'
        },
        backup: {
            name: 'Server Backup',
            url: 'http://192.168.8.254:7557',
            username: 'alijaya', 
            password: '087828060111'
        }
    },

    // WhatsApp Gateway
    whatsapp: {
        provider: 'MPWA',  // MPWA/WaWeb/dll
        apiKey: 'cj4XJjtCml31Ui2UK2E9U7fJzinaXt',
        baseUrl: 'https://wa.alijaya.net/send-message',
        sender: '6287820851413',
        admins: ['6281947215703', '6287820851413']
    },

    // MongoDB
    database: {
        uri: 'mongodb://127.0.0.1:27017/ont_manager'
    },

    // Admin Panel
    admin: {
        username: 'admin',
        password: 'admin'
    },

    // Format Pesan
    messageFormat: {
        header: '*{businessName}*\n━━━━━━━━━━━━━━━━━━━━━\n\n',
        footer: '\n━━━━━━━━━━━━━━━━━━━━━\n{businessFooter}'
    }
};

module.exports = settings; 