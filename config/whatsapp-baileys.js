const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@adiwajshing/baileys');
const path = require('path');
const fs = require('fs');
const { messages, getMessage } = require('./languages');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.qrCallback = null;
        this.connectionCallback = null;
        this.authFolder = path.join(__dirname, '..', process.env.WA_AUTH_FOLDER || '.whatsapp-auth');
        this.reconnectInterval = parseInt(process.env.WA_RECONNECT_INTERVAL) || 5000;
        this.qrTimeout = parseInt(process.env.WA_QR_TIMEOUT) || 60000;
        this.adminNumbers = (process.env.WA_ADMIN_NUMBERS || '').split(',');
        this.superAdmin = process.env.WA_SUPERADMIN;
        this.userLanguages = new Map(); // Simpan preferensi bahasa user
        
        // Buat folder auth jika belum ada
        if (!fs.existsSync(this.authFolder)) {
            fs.mkdirSync(this.authFolder, { recursive: true });
        }
    }

    async initialize() {
        try {
            // Load auth state
            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

            // Buat koneksi
            this.client = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                defaultQueryTimeoutMs: this.qrTimeout,
                reconnectInterval: this.reconnectInterval
            });

            // Handle credentials update
            this.client.ev.on('creds.update', saveCreds);

            // Handle connection update
            this.client.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && this.qrCallback) {
                    this.qrCallback(qr);
                }

                if (connection === 'open' && this.connectionCallback) {
                    this.connectionCallback(true);
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Connection closed due to:', lastDisconnect.error);
                    if (this.connectionCallback) {
                        this.connectionCallback(false);
                    }
                    if (shouldReconnect) {
                        this.initialize();
                    }
                }

                console.log('Connection update:', update);
            });

        } catch (error) {
            console.error('WhatsApp initialization error:', error);
            throw error;
        }
    }

    // Fungsi untuk set bahasa user
    setUserLanguage(phone, lang) {
        if (['id', 'en'].includes(lang)) {
            this.userLanguages.set(phone, lang);
            return true;
        }
        return false;
    }

    // Fungsi untuk get bahasa user
    getUserLanguage(phone) {
        return this.userLanguages.get(phone) || 'id'; // Default ke bahasa Indonesia
    }

    // Update fungsi sendMessage untuk support multi-bahasa
    async sendMessage(to, messagePath, params = {}) {
        try {
            if (!this.client) {
                throw new Error('WhatsApp client not initialized');
            }

            // Format nomor
            let phone = to.replace(/\D/g, '');
            if (!phone.endsWith('@s.whatsapp.net')) {
                phone = phone + '@s.whatsapp.net';
            }

            // Get bahasa user
            const lang = this.getUserLanguage(phone.split('@')[0]);
            
            // Get message dari path
            let message = getMessage(lang, messagePath);
            
            // Replace parameters
            Object.keys(params).forEach(key => {
                message = message.replace(`{${key}}`, params[key]);
            });

            // Kirim pesan
            const result = await this.client.sendMessage(phone, {
                text: message
            });

            console.log('Message sent:', {
                to: phone,
                lang,
                messagePath,
                params,
                result
            });

            return result;

        } catch (error) {
            console.error('Send message error:', error);
            throw error;
        }
    }

    // Fungsi untuk set QR callback
    onQR(callback) {
        this.qrCallback = callback;
    }

    onConnection(callback) {
        this.connectionCallback = callback;
    }
}

// Export singleton instance
const whatsappService = new WhatsAppService();
module.exports = whatsappService; 