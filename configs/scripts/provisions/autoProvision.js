// Provision: Auto Provision After Reset
// Setup otomatis setelah modem di-reset

let config = {
    // TR-069 Settings
    'InternetGatewayDevice.ManagementServer.URL': {
        value: 'http://192.168.8.89:7547',
        writable: false
    },
    'InternetGatewayDevice.ManagementServer.Username': {
        value: 'alijaya',
        writable: false
    },
    'InternetGatewayDevice.ManagementServer.Password': {
        value: '087828060111',
        writable: false
    },
    'InternetGatewayDevice.ManagementServer.PeriodicInformEnable': {
        value: true,
        writable: false
    },
    'InternetGatewayDevice.ManagementServer.PeriodicInformInterval': {
        value: 60,  // Set lebih pendek di awal
        writable: false
    },
    
    // Connection Request Settings
    'InternetGatewayDevice.ManagementServer.ConnectionRequestUsername': {
        value: 'alijaya',
        writable: false
    },
    'InternetGatewayDevice.ManagementServer.ConnectionRequestPassword': {
        value: '087828060111',
        writable: false
    },

    // STUN Settings untuk koneksi di belakang NAT
    'InternetGatewayDevice.ManagementServer.STUNEnable': {
        value: true,
        writable: false
    },
    'InternetGatewayDevice.ManagementServer.STUNServerAddress': {
        value: 'stun.l.google.com',
        writable: false
    },
    'InternetGatewayDevice.ManagementServer.STUNServerPort': {
        value: 19302,
        writable: false
    },
    
    // Nonaktifkan fitur yang bisa mengganggu
    'InternetGatewayDevice.X_ZTE-COM_ADMIN.WEB.Enable': {
        value: false,
        writable: false
    },
    'InternetGatewayDevice.X_HUAWEI_WebUserInfo.1.Enable': {
        value: false,
        writable: false
    }
};

return config; 