const express = require('express');
const router = express.Router();
const whatsappService = require('../config/whatsapp-baileys');
const { getActiveServer, switchServer } = require('../config/servers');
const axios = require('axios');
const QRCode = require('qrcode');
const { getMessage } = require('../config/languages');

// Helper function untuk mengambil data device dari GenieACS
async function getDeviceByPPPoE(pppoeUsername) {
    try {
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        return response.data.find(device => {
            // Cek username tag (tanpa prefix)
            const usernameTag = device._tags?.find(tag => !tag.startsWith('wa:'));
            
            // Return true jika username cocok
            return usernameTag === pppoeUsername;
        });
    } catch (error) {
        console.error('Error getting device:', error);
        return null;
    }
}

// Tambahkan helper function untuk get parameter value
function getParameterValue(device, path) {
    if (!device) return null;
    
    const parts = path.split('.');
    let current = device;
    
    for (const part of parts) {
        current = current[part];
        if (!current) return null;
    }
    
    return current._value || null;
}

// Tambahkan helper function untuk mencoba multiple path
function getParameterValueWithFallback(device, paths) {
    if (!device) return null;
    
    for (const path of paths) {
        // Handle wildcard paths
        if (path.includes('*')) {
            const value = getWildcardParameterValue(device, path);
            if (value !== null) return value;
        } else {
            const value = getParameterValue(device, path);
            if (value !== null) return value;
        }
    }
    return null;
}

// Add helper function untuk wildcard path
function getWildcardParameterValue(device, wildcardPath) {
    const parts = wildcardPath.split('.');
    let current = device;
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (part === '*') {
            // Cari semua key yang mungkin di level ini
            for (const key in current) {
                const remainingPath = parts.slice(i + 1).join('.');
                const value = getParameterValue(current[key], remainingPath);
                if (value !== null) return value;
            }
            return null;
        }
        
        current = current[part];
        if (!current) return null;
    }
    
    return current._value || null;
}

// Helper function untuk update SSID/Password
async function updateWiFiSettings(device, setting, value) {
    try {
        const deviceId = device._id;
        const parameterPath = setting === 'ssid' 
            ? 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'
            : 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey';

        await axios.post(
            `${process.env.GENIEACS_URL}/devices/${encodeURIComponent(deviceId)}/tasks`,
            {
                name: "setParameterValues",
                parameterValues: [[parameterPath, value, "xsd:string"]]
            },
            {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            }
        );

        return true;
    } catch (error) {
        console.error('Error updating WiFi settings:', error);
        return false;
    }
}

// Tambahkan helper function untuk validasi command
function normalizeCommand(message) {
    const fullCommand = message.trim().toLowerCase();
    const [command, ...params] = fullCommand.split(' ');
    
    const commands = {
        'cekmodem': ['cekmodem', 'cek', 'info', 'status', 'modem'],
        'gantiwifi': ['gantiwifi', 'ubahwifi', 'ssid', 'wifi'],
        'gantisandi': ['gantisandi', 'ubahsandi', 'sandi', 'password', 'pwd'],
        'listmodem': ['listmodem', 'list', 'daftar']
    };

    // Cek perintah dasar
    for (const [key, aliases] of Object.entries(commands)) {
        if (aliases.includes(command)) {
            return {
                command: key,
                params: params
            };
        }
    }

    return {
        command: command,
        params: params
    };
}

// Helper function untuk cek admin
function isAdmin(phone) {
    const admins = (process.env.MPWA_ADMINS || '').split(',');
    console.log('Checking admin status:', {
        phone,
        admins,
        isAdmin: admins.includes(phone)
    });
    return admins.includes(phone);
}

// Update getDeviceForUser dengan server config
async function getDeviceForUser(phone) {
    try {
        console.log('\n=== Getting Device for User ===');
        const server = getActiveServer();
        console.log('Using server:', server.name);
        console.log('Server URL:', server.url);

        // Test koneksi GenieACS
        try {
            await axios.get(`${server.url}/devices`, {
                auth: {
                    username: server.username,
                    password: server.password
                },
                timeout: 5000
            });
        } catch (error) {
            console.error('Primary server error:', error.message);
            
            // Coba switch ke server backup jika primary gagal
            if (process.env.GENIEACS_SERVER === 'primary') {
                console.log('Switching to backup server...');
                switchServer('backup');
                const backupServer = getActiveServer();
                
                try {
                    await axios.get(`${backupServer.url}/devices`, {
                        auth: {
                            username: backupServer.username,
                            password: backupServer.password
                        },
                        timeout: 5000
                    });
                    console.log('Successfully switched to backup server');
                } catch (backupError) {
                    console.error('Backup server also failed:', backupError.message);
                    switchServer('primary'); // Switch back to primary
                    throw new Error('Semua server GenieACS tidak dapat diakses');
                }
            } else {
                throw error;
            }
        }

        // Get devices dengan server yang aktif
        const activeServer = getActiveServer();
        const response = await axios.get(`${activeServer.url}/devices`, {
            auth: {
                username: activeServer.username,
                password: activeServer.password
            },
            timeout: 10000
        });

        console.log('GenieACS Response Status:', response.status);
        console.log('Total Devices:', response.data.length);
        
        // Log devices dengan tag wa: untuk debugging
        const devicesWithWaTags = response.data.filter(d => 
            d._tags?.some(tag => tag.startsWith('wa:'))
        );
        console.log('Devices with WA tags:', devicesWithWaTags.map(d => ({
            id: d._id,
            tags: d._tags
        })));

        // Cek status admin
        const isAdminUser = isAdmin(phone);
        console.log('Is Admin:', isAdminUser);

        if (isAdminUser) {
            return {
                isAdmin: true,
                devices: response.data
            };
        }

        // Cari device untuk user biasa
        const device = response.data.find(d => {
            const waTags = d._tags?.filter(tag => tag.startsWith('wa:')) || [];
            const found = waTags.some(tag => tag.split(':')[1] === phone);
            console.log('Checking device:', {
                id: d._id,
                waTags,
                phone,
                found
            });
            return found;
        });

        console.log('Found device:', device?._id);
        console.log('=== End Getting Device ===\n');

        return {
            isAdmin: false,
            device: device
        };
    } catch (error) {
        console.error('Error getting device:', {
            message: error.message,
            code: error.code,
            config: {
                url: error.config?.url,
                method: error.config?.method,
                auth: error.config?.auth
            },
            response: error.response?.data
        });
        throw error;
    }
}

// Update helper function untuk mendapatkan informasi device lengkap
async function getDetailedDeviceInfo(device) {
    const paths = {
        // PPPoE & Network Info
        pppoe: [
            'VirtualParameters.pppUsername',      // Primary PPPoE username
            'VirtualParameters.pppoeUsername',    // Alternative PPPoE username
            'VirtualParameters.pppoeUsername2',   // Backup PPPoE username
            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username'
        ],
        status: [
            'VirtualParameters.Status',
            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus'
        ],
        ipWan: [
            'VirtualParameters.pppIP',
            'VirtualParameters.pppoeIP'
        ],
        ipTr069: [
            'VirtualParameters.tr069',           // Primary TR-069 IP
            'VirtualParameters.IPTR069'          // Alternative TR-069 IP
        ],
        macAddress: [
            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress'
        ],

        // WiFi Info
        ssid: [
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'
        ],
        password: [
            'VirtualParameters.WlanPassword'
        ],
        connectedDevices: [
            'VirtualParameters.userconnected',    // Primary connected users count
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'
        ],
        wifiChannel: [
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel'
        ],
        wifiEnabled: [
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable'
        ],

        // ONU Info
        rxPower: [
            'VirtualParameters.redaman',         // Primary RX power/attenuation
            'VirtualParameters.RXPower',         // Alternative RX power
            'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower'
        ],
        txPower: [
            'VirtualParameters.TXPower',
            'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.TXPower'
        ],
        temperature: [
            'VirtualParameters.temp',            // Primary temperature
            'VirtualParameters.Temperature',      // Alternative temperature
            'InternetGatewayDevice.DeviceInfo.Temperature'
        ],
        uptime: [
            'VirtualParameters.uptimeDevice',    // Primary uptime
            'VirtualParameters.getdeviceuptime', // Alternative uptime
            'InternetGatewayDevice.DeviceInfo.UpTime'
        ],
        ponMode: [
            'VirtualParameters.PonMode',         // PON mode info
            'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.PONMode'
        ],

        // Device Info
        productClass: [
            'DeviceID.ProductClass'
        ],
        serialNumber: [
            'DeviceID.SerialNumber'
        ],
        softwareVersion: [
            'InternetGatewayDevice.DeviceInfo.SoftwareVersion'
        ],
        hardwareVersion: [
            'InternetGatewayDevice.DeviceInfo.HardwareVersion'
        ],
        manufacturer: [
            'DeviceID.Manufacturer'
        ],
        lastInform: [
            'Events.Inform'
        ]
    };

    const info = {
        // Get all values using paths
        pppoe: getParameterValueWithFallback(device, paths.pppoe),
        status: getParameterValueWithFallback(device, paths.status),
        ipWan: getParameterValueWithFallback(device, paths.ipWan),
        ipTr069: getParameterValueWithFallback(device, paths.ipTr069),
        macAddress: getParameterValueWithFallback(device, paths.macAddress),
        ssid: getParameterValueWithFallback(device, paths.ssid),
        password: getParameterValueWithFallback(device, paths.password),
        connectedDevices: getParameterValueWithFallback(device, paths.connectedDevices),
        wifiChannel: getParameterValueWithFallback(device, paths.wifiChannel),
        wifiEnabled: getParameterValueWithFallback(device, paths.wifiEnabled),
        rxPower: getParameterValueWithFallback(device, paths.rxPower),
        txPower: getParameterValueWithFallback(device, paths.txPower),
        temperature: getParameterValueWithFallback(device, paths.temperature),
        uptime: getParameterValueWithFallback(device, paths.uptime),
        ponMode: getParameterValueWithFallback(device, paths.ponMode),
        productClass: getParameterValueWithFallback(device, paths.productClass),
        serialNumber: getParameterValueWithFallback(device, paths.serialNumber),
        softwareVersion: getParameterValueWithFallback(device, paths.softwareVersion),
        hardwareVersion: getParameterValueWithFallback(device, paths.hardwareVersion),
        manufacturer: getParameterValueWithFallback(device, paths.manufacturer),
        lastInform: getParameterValueWithFallback(device, paths.lastInform),
        location: device._tags?.filter(tag => !tag.startsWith('wa:'))?.join(', ')
    };

    // Format response dengan identitas
    const response = 
        '*ALIJAYA JURAGAN PULSA & WIFI HOTSPOT*\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '📱 *INFORMASI MODEM*\n\n' +
        '🌐 *Network*\n' +
        `• PPPoE: ${info.pppoe || 'N/A'}\n` +
        `• Status: ${info.status || 'N/A'}\n` +
        `• IP WAN: ${info.ipWan || 'N/A'}\n` +
        `• IP TR069: ${info.ipTr069 || 'N/A'}\n` +
        `• MAC: ${info.macAddress || 'N/A'}\n\n` +
        
        '📶 *WiFi*\n' +
        `• SSID: ${info.ssid || 'N/A'}\n` +
        `• Channel: ${info.wifiChannel || 'N/A'}\n` +
        `• Status: ${info.wifiEnabled ? 'Aktif' : 'Nonaktif'}\n` +
        `• Connected: ${info.connectedDevices || '0'} device(s)\n\n` +
        
        '📊 *ONU Status*\n' +
        `• Redaman: ${info.rxPower || 'N/A'} dBm\n` +
        `• TX Power: ${info.txPower || 'N/A'} dBm\n` +
        `• Temperature: ${info.temperature || 'N/A'}°C\n` +
        `• PON Mode: ${info.ponMode || 'N/A'}\n` +
        `• Uptime: ${info.uptime || 'N/A'}\n\n` +
        
        '📋 *Device Info*\n' +
        `• Model: ${info.manufacturer || ''} ${info.productClass || 'N/A'}\n` +
        `• Serial Number: ${info.serialNumber || 'N/A'}\n` +
        `• Hardware Ver: ${info.hardwareVersion || 'N/A'}\n` +
        `• Software Ver: ${info.softwareVersion || 'N/A'}\n` +
        `• Last Inform: ${info.lastInform ? new Date(info.lastInform).toLocaleString() : 'N/A'}\n` +
        `• Location: ${info.location || 'N/A'}\n\n` +
        
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        'Info & Pembayaran: 0878-2085-1413';

    return {
        info,
        response
    };
}

// Update pesan bantuan untuk admin
const adminHelpMessage = 
    '*ALIJAYA JURAGAN PULSA & WIFI HOTSPOT*\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '📱 *Panduan Admin*\n\n' +
    'Perintah yang tersedia:\n' +
    '• listmodem - melihat semua modem\n' +
    '• cekmodem [pppoe] - cek detail modem\n' +
    '• gantiwifi [pppoe] [nama] - ubah nama WiFi\n' +
    '• gantisandi [pppoe] [sandi] - ubah password WiFi\n' +
    '• switchserver [primary/backup] - ganti server\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    'Info & Pembayaran: 0878-2085-1413';

// Update pesan bantuan untuk user
const userHelpMessage = 
    '*ALIJAYA JURAGAN PULSA & WIFI HOTSPOT*\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '📱 *Panduan Penggunaan*\n\n' +
    'Perintah yang tersedia:\n' +
    '• cekmodem - lihat status modem\n' +
    '• gantiwifi [nama] - ubah nama WiFi\n' +
    '• gantisandi [sandi] - ubah password WiFi\n\n' +
    'Contoh:\n' +
    '• cekmodem\n' +
    '• gantiwifi WiFi Rumah\n' +
    '• gantisandi password123\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━\n' +
    'Info & Pembayaran: 0878-2085-1413';

// Update pesan error juga
const errorMessages = {
    noDevice: 
        '*ALIJAYA JURAGAN PULSA & WIFI HOTSPOT*\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '❌ Maaf, nomor WhatsApp Anda tidak terdaftar dalam sistem.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        'Info & Pembayaran: 0878-2085-1413',
    
    systemError:
        '*ALIJAYA JURAGAN PULSA & WIFI HOTSPOT*\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '❌ Terjadi kesalahan saat mengakses sistem.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        'Info & Pembayaran: 0878-2085-1413'
};

// Update webhook handler
router.post('/webhook', async (req, res) => {
    try {
        console.log('\n=== WEBHOOK REQUEST ===');
        console.log('Headers:', req.headers);
        console.log('Body:', req.body);
        console.log('Query:', req.query);

        // Extract data
        const phone = req.body.from || req.query.from;
        const message = req.body.message || req.query.message;

        console.log('Extracted data:', { phone, message });

        if (!phone || !message) {
            console.log('Missing required fields');
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
                received: { body: req.body, query: req.query }
            });
        }

        // Format nomor
        const formattedPhone = phone.replace(/\D/g, '');
        console.log('Formatted phone:', formattedPhone);

        // Get device info
        const deviceInfo = await getDeviceForUser(formattedPhone);
        console.log('Device info:', {
            isAdmin: deviceInfo?.isAdmin,
            deviceCount: deviceInfo?.devices?.length,
            deviceId: deviceInfo?.device?._id
        });

        // Process command
        const { command, params } = normalizeCommand(message);
        console.log('Command:', { command, params });

        if (!deviceInfo) {
            console.log('No device info found');
            await whatsappService.sendMessage(formattedPhone, 
                errorMessages.systemError);
            return res.json({ success: false, message: 'Error getting device info' });
        }

        if (!deviceInfo.isAdmin && !deviceInfo.device) {
            await whatsappService.sendMessage(formattedPhone, 
                errorMessages.noDevice);
            return res.json({ success: false, message: 'Device not found' });
        }

        // Proses command admin
        if (deviceInfo.isAdmin) {
            console.log('Processing admin command:', command);
            
            // Jika perintah list
            if (command === 'listmodem') {
                console.log('Executing listmodem command');
                const deviceList = deviceInfo.devices.map((d, index) => {
                    const info = {
                        pppoe: getParameterValueWithFallback(d, [
                            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
                            'InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANPPPConnection.1.Username'
                        ]),
                        ssid: getParameterValueWithFallback(d, [
                            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
                            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID'
                        ]),
                        status: getParameterValueWithFallback(d, [
                            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus',
                            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ConnectionStatus'
                        ])
                    };
                    return `${index + 1}. PPPoE: ${info.pppoe || 'Tidak tersedia'}\n    WiFi: ${info.ssid || 'Tidak tersedia'}\n    Status: ${info.status || 'Tidak tersedia'}`;
                }).join('\n\n');

                const response = 
                    '📱 *Daftar Modem*\n\n' +
                    deviceList + '\n\n' +
                    '*Perintah Admin:*\n' +
                    '• listmodem - Menampilkan semua modem\n' +
                    '• cekmodem [nomor_pppoe] - Cek detail modem\n' +
                    '• gantiwifi [nomor_pppoe] [nama_baru]\n' +
                    '• gantisandi [nomor_pppoe] [sandi_baru]';

                await whatsappService.sendMessage(formattedPhone, response);
                return res.json({ success: true });
            }
            
            // Jika perintah cek tanpa parameter
            if (command === 'cekmodem' && params.length === 0) {
                console.log('Executing cekmodem command without parameters');
                await whatsappService.sendMessage(formattedPhone, adminHelpMessage);
                return res.json({ success: true });
            }

            // Jika perintah cek dengan parameter
            if (command === 'cekmodem' && params.length > 0) {
                const pppoeNumber = params[0].toLowerCase(); // Convert ke lowercase
                console.log('Searching for device with PPPoE:', pppoeNumber);

                // Cari device dengan mencoba semua path PPPoE yang mungkin
                const targetDevice = deviceInfo.devices.find(d => {
                    // Coba semua path yang mungkin
                    const paths = [
                        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
                        'InternetGatewayDevice.WANDevice.2.WANConnectionDevice.1.WANPPPConnection.1.Username',
                        'Device.PPP.Interface.1.Username',
                        'Device.PPP.Interface.2.Username',
                        'InternetGatewayDevice.Services.PPPoEService.1.Username',
                        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Username',
                        '_tags'
                    ];

                    // Log device yang sedang dicek
                    console.log('Checking device:', {
                        id: d._id,
                        manufacturer: getParameterValue(d, 'DeviceID.Manufacturer'),
                        model: getParameterValue(d, 'DeviceID.ProductClass'),
                        tags: d._tags,
                        allParams: Object.keys(d).filter(k => k.toLowerCase().includes('username'))
                    });

                    // Cek setiap path
                    for (const path of paths) {
                        if (path === '_tags') {
                            // Cek di tags
                            const usernameTag = d._tags?.find(tag => {
                                if (!tag.startsWith('wa:')) {
                                    console.log('Checking tag:', { tag, searchFor: pppoeNumber });
                                    return tag.toLowerCase().includes(pppoeNumber);
                                }
                                return false;
                            });
                            if (usernameTag) {
                                console.log('Found match in tags:', usernameTag);
                                return true;
                            }
                        } else {
                            // Cek di parameter values
                            const username = getParameterValue(d, path);
                            console.log('Checking path:', { 
                                path, 
                                value: username,
                                searchFor: pppoeNumber,
                                matches: username?.toLowerCase().includes(pppoeNumber)
                            });
                            if (username && username.toLowerCase().includes(pppoeNumber)) {
                                console.log('Found match in path:', path);
                                return true;
                            }
                        }
                    }

                    // Cek semua parameter yang mengandung 'username'
                    const allParams = Object.keys(d).filter(k => k.toLowerCase().includes('username'));
                    for (const param of allParams) {
                        const value = d[param]?._value;
                        if (value && value.toLowerCase().includes(pppoeNumber)) {
                            console.log('Found match in parameter:', { param, value });
                            return true;
                        }
                    }

                    return false;
                });

                if (!targetDevice) {
                    console.log('No device found for PPPoE:', pppoeNumber);
                    await whatsappService.sendMessage(formattedPhone, 
                        '❌ Device dengan PPPoE yang mengandung "' + pppoeNumber + '" tidak ditemukan');
                    return res.json({ success: false });
                }

                // Dapatkan informasi detail
                const { response } = await getDetailedDeviceInfo(targetDevice);
                await whatsappService.sendMessage(formattedPhone, response);
                return res.json({ success: true });
            }

            // Command admin untuk ubah SSID
            if (command === 'gantiwifi' && params.length >= 2) {
                const [pppoeNumber, ...ssidParts] = params;
                const newSSID = ssidParts.join(' ');

                const targetDevice = deviceInfo.devices.find(d => 
                    getParameterValue(d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username') === pppoeNumber
                );

                if (!targetDevice) {
                    await whatsappService.sendMessage(formattedPhone, 
                        '❌ Device dengan nomor PPPoE tersebut tidak ditemukan');
                    return res.json({ success: false });
                }

                if (newSSID.length < 3) {
                    await whatsappService.sendMessage(formattedPhone, 
                        '❌ SSID harus memiliki minimal 3 karakter');
                    return res.json({ success: false });
                }

                const success = await updateWiFiSettings(targetDevice, 'ssid', newSSID);
                if (success) {
                    await whatsappService.sendMessage(formattedPhone, 
                        `✅ SSID untuk PPPoE ${pppoeNumber} berhasil diubah menjadi "${newSSID}"`);
                } else {
                    await whatsappService.sendMessage(formattedPhone, 
                        '❌ Gagal mengubah SSID');
                }
                return res.json({ success: true });
            }

            // Command admin untuk ubah password
            if (command === 'gantisandi' && params.length >= 2) {
                const [pppoeNumber, ...pwdParts] = params;
                const newPassword = pwdParts.join(' ');

                const targetDevice = deviceInfo.devices.find(d => 
                    getParameterValue(d, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username') === pppoeNumber
                );

                if (!targetDevice) {
                    await whatsappService.sendMessage(formattedPhone, 
                        '❌ Device dengan nomor PPPoE tersebut tidak ditemukan');
                    return res.json({ success: false });
                }

                if (newPassword.length < 8) {
                    await whatsappService.sendMessage(formattedPhone, 
                        '❌ Password harus memiliki minimal 8 karakter');
                    return res.json({ success: false });
                }

                const success = await updateWiFiSettings(targetDevice, 'password', newPassword);
                if (success) {
                    await whatsappService.sendMessage(formattedPhone, 
                        `✅ Password WiFi untuk PPPoE ${pppoeNumber} berhasil diubah`);
                } else {
                    await whatsappService.sendMessage(formattedPhone, 
                        '❌ Gagal mengubah password');
                }
                return res.json({ success: true });
            }

            // Tambahkan command untuk admin untuk switch server
            if (command === 'switchserver') {
                const serverType = params[0]?.toLowerCase();
                if (serverType && (serverType === 'primary' || serverType === 'backup')) {
                    const success = switchServer(serverType);
                    if (success) {
                        await whatsappService.sendMessage(formattedPhone, 
                            `✅ Berhasil switch ke server ${serverType}`);
                    } else {
                        await whatsappService.sendMessage(formattedPhone, 
                            '❌ Gagal switch server');
                    }
                    return res.json({ success: true });
                }
            }

            // Handle command bahasa
            if (command === 'lang' || command === 'bahasa') {
                const lang = params[0]?.toLowerCase();
                
                if (!lang || !['id', 'en'].includes(lang)) {
                    await whatsappService.sendMessage(formattedPhone, 'commands.langInvalid');
                    return res.json({ success: false });
                }

                // Set bahasa user
                whatsappService.setUserLanguage(formattedPhone, lang);
                
                // Kirim konfirmasi
                await whatsappService.sendMessage(formattedPhone, 'commands.langChanged', {
                    lang: lang === 'id' ? 'Indonesia' : 'English'
                });
                
                return res.json({ success: true });
            }

            // Update menu command untuk tampilkan opsi bahasa
            if (command === 'menu') {
                const lang = whatsappService.getUserLanguage(formattedPhone);
                const menuMessage = `${getMessage(lang, 'menu.title')}\n\n` +
                    `${getMessage(lang, 'menu.checkStatus')}\n` +
                    `${getMessage(lang, 'menu.changeWifi')}\n` +
                    `${getMessage(lang, 'menu.changePass')}\n` +
                    `${getMessage(lang, 'menu.help')}\n\n` +
                    `*Language/Bahasa*:\n` +
                    `lang id - Bahasa Indonesia\n` +
                    `lang en - English`;
                    
                await whatsappService.sendMessage(formattedPhone, menuMessage);
                return res.json({ success: true });
            }
        }

        // Proses perintah normal untuk user biasa
        const targetDevice = deviceInfo.isAdmin ? deviceInfo.devices[0] : deviceInfo.device;

        if (command === 'cekmodem' || command === 'cek') {
            console.log('Executing CEKDEVICE command');
            const { response } = await getDetailedDeviceInfo(targetDevice);
            await whatsappService.sendMessage(formattedPhone, response);
        }
        else if (command.startsWith('gantiwifi ')) {
            // ... existing code with new messages ...
        }
        else if (command.startsWith('gantisandi ')) {
            // ... existing code with new messages ...
        }
        else {
            await whatsappService.sendMessage(formattedPhone, userHelpMessage);
        }

        console.log('=== END WEBHOOK ===\n');
        res.json({ success: true });

    } catch (error) {
        console.error('Webhook error:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test routes
router.get('/test/:phone?', async (req, res) => {
    try {
        console.log('Test route accessed');
        
        // Jika ada parameter phone, kirim test message
        if (req.params.phone) {
            const phone = req.params.phone;
            console.log('Testing send message to:', phone);
            
            const result = await whatsappService.sendMessage(
                phone, 
                '🔧 Ini adalah pesan test dari sistem'
            );
            
            return res.json({ 
                success: true, 
                message: 'Test message sent',
                result 
            });
        }
        
        // Jika tidak ada parameter phone, hanya return status
        res.json({ 
            status: 'WhatsApp route working',
            endpoints: {
                test: '/whatsapp/test',
                testSend: '/whatsapp/test/[phone_number]',
                webhook: '/whatsapp/webhook'
            }
        });
    } catch (error) {
        console.error('Test error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Test webhook route
router.get('/test-webhook', async (req, res) => {
    try {
        // Simulasi webhook request dengan nomor penerima yang sudah ditag di GenieACS
        const testRequest = {
            from: '6281947215703',  // Nomor yang akan dicek (yang sudah ditag di GenieACS)
            message: 'CEKDEVICE'
        };

        console.log('Sending test webhook request:', testRequest);

        // Kirim request ke webhook endpoint
        const response = await axios.post(`http://localhost:3100/whatsapp/webhook`, testRequest, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        res.json({
            success: true,
            message: 'Webhook test executed',
            testRequest,
            response: response.data
        });
    } catch (error) {
        console.error('Test webhook error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data
        });
    }
});

// Test route sederhana
router.get('/ping', (req, res) => {
    console.log('Ping received');
    res.json({ status: 'ok', message: 'WhatsApp webhook is running' });
});

// Test webhook dengan POST
router.post('/ping', (req, res) => {
    console.log('POST ping received:', {
        headers: req.headers,
        body: req.body,
        query: req.query
    });
    res.json({ status: 'ok', message: 'POST webhook is working' });
});

// Endpoint untuk menampilkan QR
router.get('/qr', (req, res) => {
    res.render('whatsapp-qr');
});

// Endpoint untuk get QR data via WebSocket
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
    // Set callback untuk QR
    whatsappService.onQR(async (qr) => {
        try {
            const qrImage = await QRCode.toDataURL(qr);
            ws.send(JSON.stringify({
                type: 'qr',
                data: qrImage
            }));
        } catch (error) {
            console.error('QR generation error:', error);
        }
    });

    // Set callback untuk status koneksi
    whatsappService.onConnection((connected) => {
        ws.send(JSON.stringify({
            type: 'connection',
            connected: connected
        }));
    });
});

// Template untuk QR page
router.get('/qr', (req, res) => {
    res.render('whatsapp-qr', {
        title: 'WhatsApp QR Code'
    });
});

module.exports = { router, wss }; 