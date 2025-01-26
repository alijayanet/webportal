// Konfigurasi server GenieACS
const servers = {
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
};

// Helper function untuk mendapatkan server aktif
function getActiveServer() {
    // Baca dari environment variable jika ada
    const serverType = process.env.GENIEACS_SERVER || 'primary';
    return servers[serverType];
}

// Export fungsi dan konfigurasi
module.exports = {
    servers,
    getActiveServer,
    // Helper function untuk switch server
    switchServer: (type) => {
        if (servers[type]) {
            process.env.GENIEACS_SERVER = type;
            return true;
        }
        return false;
    }
}; 