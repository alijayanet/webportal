module.exports = {
    business: {
        name: 'ONT Manager',
        phone: '',
        footer: 'Info & Pembayaran'
    },
    whatsapp: {
        authFolder: '.whatsapp-auth',
        reconnectInterval: 5000,
        qrTimeout: 60000,
        defaultLang: 'id',
        admins: []
    },
    servers: {
        primary: {
            url: 'http://localhost:7557',
            username: 'admin',
            password: 'admin'
        }
    }
}; 