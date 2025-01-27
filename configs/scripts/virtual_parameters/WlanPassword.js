// Virtual Parameter: WiFi Password
let value = null;

// Array path untuk berbagai model ONT/router
const passwordPaths = [
    // ZTE
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey',
    // Huawei
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_HW_WPAPreSharedKey',
    // Nokia/Alcatel
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_ALU_COM_KeyPassphrase',
    // Fiberhome
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_FHTT_KeyPassphrase'
];

// Coba setiap path sampai dapat value
for (let path of passwordPaths) {
    for (let p of declare) {
        if (p[0] === 'InternetGatewayDevice' && p[1] === path.split('.').slice(1).join('.')) {
            value = p[2];
            break;
        }
    }
    if (value) break;
}

return {writable: true, value: value}; 