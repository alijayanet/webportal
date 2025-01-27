// Virtual Parameter: PON Mode
// Menampilkan mode PON (GPON/EPON)
let value = null;
for (let p of declare) {
    if (p[0] === 'InternetGatewayDevice') {
        if (p[1] === 'WANDevice.1.WANPONInterfaceConfig.PONMode' ||
            p[1] === 'X_ZTE-COM_WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.PONMode' ||
            p[1] === 'X_HUAWEI_WANDevice.1.X_HW_PON.PONMode') {
            value = p[2];
            break;
        }
    }
}
return {writable: false, value: value}; 