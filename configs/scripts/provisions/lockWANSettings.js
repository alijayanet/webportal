// Provision: Lock WAN Settings
// Mengunci pengaturan WAN agar tidak bisa diubah dari modem

let config = {
    // Lock PPPoE settings
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username': {
        value: declare[0].value,
        writable: false
    },
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password': {
        value: declare[1].value,
        writable: false
    },
    
    // Lock connection mode
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionType': {
        value: 'IP_Routed',
        writable: false
    },
    
    // Lock VLAN settings
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_BROADCOM_COM_VLANID': {
        value: declare[2].value,
        writable: false
    },
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_ZTE-COM_WANPPPConnection.VLANIDMark': {
        value: declare[2].value,
        writable: false
    },
    
    // Disable WAN interface modification
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable': {
        value: true,
        writable: false
    }
};

// Lock web interface settings jika ada
const webInterfaceSettings = {
    'InternetGatewayDevice.X_ZTE-COM_ADMIN.WEB.Enable': {
        value: false,
        writable: false
    },
    'InternetGatewayDevice.X_HUAWEI_WebUserInfo.1.Enable': {
        value: false,
        writable: false
    }
};

return {...config, ...webInterfaceSettings}; 