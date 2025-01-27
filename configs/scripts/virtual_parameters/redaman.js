// Virtual Parameter: Redaman/RX Power
let value = null;

const rxPowerPaths = [
    // GPON
    'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.ReceivePowerLevel',
    // ZTE
    'InternetGatewayDevice.X_ZTE-COM_WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RxPower',
    // Huawei
    'InternetGatewayDevice.X_HW_WANDevice.1.X_HW_GPON.OpticalReceivePower',
    // Fiberhome
    'InternetGatewayDevice.WANDevice.1.X_FHTT_PONInterfaceConfig.ReceivePowerLevel',
    // Nokia/Alcatel
    'InternetGatewayDevice.WANDevice.1.X_ALU_PONInterfaceConfig.OpticalSignalLevel'
];

for (let path of rxPowerPaths) {
    for (let p of declare) {
        if (p[0] === 'InternetGatewayDevice' && p[1] === path.split('.').slice(1).join('.')) {
            // Convert to dBm if needed
            let rxValue = parseFloat(p[2]);
            if (rxValue > 0) rxValue = -rxValue; // Ensure negative value
            value = rxValue.toFixed(2);
            break;
        }
    }
    if (value) break;
}

return {writable: false, value: value}; 