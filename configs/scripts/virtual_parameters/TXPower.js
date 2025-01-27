// Virtual Parameter: TX Power
let value = null;

const txPowerPaths = [
    // GPON Standard
    'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.TransmitPowerLevel',
    // ZTE
    'InternetGatewayDevice.X_ZTE-COM_WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TxPower',
    // Huawei
    'InternetGatewayDevice.X_HW_WANDevice.1.X_HW_GPON.OpticalTransmitPower',
    // Fiberhome
    'InternetGatewayDevice.WANDevice.1.X_FHTT_PONInterfaceConfig.TransmitPowerLevel'
];

for (let path of txPowerPaths) {
    for (let p of declare) {
        if (p[0] === 'InternetGatewayDevice' && p[1] === path.split('.').slice(1).join('.')) {
            value = parseFloat(p[2]).toFixed(2);
            break;
        }
    }
    if (value) break;
}

return {writable: false, value: value}; 