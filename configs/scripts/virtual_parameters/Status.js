// Virtual Parameter: Status
// Menampilkan status koneksi ONU
let status = 'Offline';
for (let p of declare) {
    if (p[0] === 'InternetGatewayDevice' && 
        p[1] === 'WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus') {
        status = p[2];
        break;
    }
}
return {writable: false, value: status}; 