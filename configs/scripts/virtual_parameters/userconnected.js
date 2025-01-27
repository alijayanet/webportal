// Virtual Parameter: Connected Users
let value = 0;

const associatedPaths = [
    // Standard
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
    // ZTE
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_ZTE-COM_AssociatedDeviceNum',
    // Huawei
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_HW_AssociatedDeviceNum'
];

for (let path of associatedPaths) {
    for (let p of declare) {
        if (p[0] === 'InternetGatewayDevice' && p[1] === path.split('.').slice(1).join('.')) {
            value = parseInt(p[2]);
            break;
        }
    }
    if (value) break;
}

return {writable: false, value: value}; 