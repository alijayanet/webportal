// Virtual Parameter: Temperature
let value = null;

const tempPaths = [
    // ZTE
    'InternetGatewayDevice.DeviceInfo.X_ZTE-COM_Temperature',
    // Huawei
    'InternetGatewayDevice.DeviceInfo.X_HW_Temperature',
    // Nokia
    'InternetGatewayDevice.DeviceInfo.X_ALU_COM_Temperature',
    // Fiberhome
    'InternetGatewayDevice.DeviceInfo.X_FHTT_Temperature'
];

for (let path of tempPaths) {
    for (let p of declare) {
        if (p[0] === 'InternetGatewayDevice' && p[1] === path.split('.').slice(1).join('.')) {
            value = parseFloat(p[2]).toFixed(1);
            break;
        }
    }
    if (value) break;
}

return {writable: false, value: value}; 