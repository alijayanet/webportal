// Virtual Parameter: WiFi SSID
let value = null;

const ssidPaths = [
    // Standard
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
    // ZTE
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_ZTE-COM_SSIDName',
    // Huawei
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_HW_SSID',
    // Nokia
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_ALU_COM_SSID'
];

for (let path of ssidPaths) {
    for (let p of declare) {
        if (p[0] === 'InternetGatewayDevice' && p[1] === path.split('.').slice(1).join('.')) {
            value = p[2];
            break;
        }
    }
    if (value) break;
}

return {writable: true, value: value}; 