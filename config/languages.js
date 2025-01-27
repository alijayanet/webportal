const messages = {
    id: {
        // Status & Informasi
        deviceStatus: {
            online: "🟢 Online",
            offline: "🔴 Offline",
            unknown: "⚪ Tidak diketahui"
        },
        deviceInfo: {
            title: "*INFO PERANGKAT*",
            model: "Model",
            serial: "Serial Number",
            status: "Status",
            uptime: "Uptime",
            rxPower: "RX Power",
            connectedUsers: "Pengguna Terhubung",
            wifiName: "Nama WiFi",
            pppoeUser: "Username PPPoE",
            pppoeIP: "IP PPPoE"
        },
        commands: {
            notFound: "❌ Perintah tidak ditemukan\nKetik *menu* untuk melihat daftar perintah",
            notAuthorized: "❌ Anda tidak memiliki akses untuk perintah ini",
            success: "✅ Berhasil",
            failed: "❌ Gagal"
        },
        menu: {
            title: "*MENU PERINTAH*",
            checkStatus: "cek - Cek status perangkat",
            changeWifi: "gantiwifi [nama] - Ganti nama WiFi",
            changePass: "gantisandi [password] - Ganti password WiFi",
            help: "menu - Tampilkan menu ini"
        }
    },
    en: {
        // Status & Information
        deviceStatus: {
            online: "🟢 Online",
            offline: "🔴 Offline",
            unknown: "⚪ Unknown"
        },
        deviceInfo: {
            title: "*DEVICE INFORMATION*",
            model: "Model",
            serial: "Serial Number", 
            status: "Status",
            uptime: "Uptime",
            rxPower: "RX Power",
            connectedUsers: "Connected Users",
            wifiName: "WiFi Name",
            pppoeUser: "PPPoE Username",
            pppoeIP: "PPPoE IP"
        },
        commands: {
            notFound: "❌ Command not found\nType *menu* to see command list",
            notAuthorized: "❌ You don't have access to this command",
            success: "✅ Success",
            failed: "❌ Failed"
        },
        menu: {
            title: "*COMMAND MENU*",
            checkStatus: "check - Check device status",
            changeWifi: "changewifi [name] - Change WiFi name",
            changePass: "changepass [password] - Change WiFi password",
            help: "menu - Show this menu"
        }
    }
};

// Helper untuk get message
function getMessage(lang, path) {
    const parts = path.split('.');
    let current = messages[lang] || messages.id; // Default ke bahasa Indonesia
    
    for (const part of parts) {
        current = current[part];
        if (!current) return path; // Return path jika message tidak ditemukan
    }
    
    return current;
}

module.exports = {
    messages,
    getMessage
}; 