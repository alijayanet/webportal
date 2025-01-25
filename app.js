const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'rahasia-session',
    resave: false,
    saveUninitialized: true
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
    res.render('login', { error: null });
});

// Login handler
app.post('/login', async (req, res) => {
    const { username } = req.body;
    try {
        console.log('Attempting to connect to GenieACS server...');
        
        // Get all devices first
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            },
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Total devices:', response.data.length);

        // Find device with matching tag
        const device = response.data.find(d => {
            console.log('Checking device:', {
                id: d._id,
                tags: d._tags,
                rawDevice: JSON.stringify(d)
            });
            return d._tags && d._tags.includes(username);
        });

        if (device) {
            console.log('Device found:', {
                deviceId: device._id,
                tags: device._tags
            });
            
            req.session.username = username;
            req.session.deviceId = device._id;
            res.redirect('/dashboard');
        } else {
            // Debug: Log all devices and their tags
            console.log('No device found with tag:', username);
            console.log('Available devices:', response.data.map(d => ({
                id: d._id,
                tags: d._tags || [],
                rawDevice: JSON.stringify(d)
            })));

            res.render('login', { error: 'Nomor pelanggan tidak ditemukan' });
        }
    } catch (error) {
        console.error('Login error:', error);
        console.error('Full error details:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            url: error.config?.url
        });
        res.render('login', { error: 'Terjadi kesalahan saat menghubungi server' });
    }
});

// Dashboard route
app.get('/dashboard', async (req, res) => {
    if (!req.session.username || !req.session.deviceId) {
        return res.redirect('/');
    }

    try {
        // Get device data dengan virtual parameters
        const deviceResponse = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            params: {
                query: JSON.stringify({ "_id": req.session.deviceId }),
                projection: JSON.stringify([
                    "_id",
                    "_tags",
                    // WiFi parameters
                    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID._value",
                    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase._value",
                    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey._value",
                    // Connected devices
                    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations._value",
                    // Virtual parameters
                    "VirtualParameters.WifiPassword._value",
                    "VirtualParameters.WifiSSID._value",
                    "VirtualParameters.ConnectedDevices._value",
                    // Alternative paths
                    "Device.WiFi.AccessPoint.1.Security.KeyPassphrase._value",
                    "Device.WiFi.AccessPoint.1.SSIDReference._value",
                    "Device.WiFi.AccessPoint.1.AssociatedDeviceNumberOfEntries._value"
                ])
            },
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        console.log('Raw Response:', JSON.stringify(deviceResponse.data, null, 2));

        if (!deviceResponse.data || !deviceResponse.data.length) {
            throw new Error('Device not found');
        }

        const device = deviceResponse.data[0];
        
        // Debug log
        console.log('Device data received:', JSON.stringify(device, null, 2));

        // Parse device ID untuk informasi dasar
        const [manufacturer, model, serialNumber] = req.session.deviceId.split('-');

        // Ekstrak SSID dari berbagai kemungkinan path
        let ssid = 'N/A';
        const ssidPaths = [
            device?.InternetGatewayDevice?.LANDevice?.[1]?.WLANConfiguration?.[1]?.SSID?._value,
            device?.VirtualParameters?.WifiSSID?._value,
            device?.Device?.WiFi?.AccessPoint?.[1]?.SSIDReference?._value
        ];

        for (const path of ssidPaths) {
            if (path) {
                ssid = path;
                break;
            }
        }

        // Ekstrak user connected dari berbagai kemungkinan path
        let userConnected = '0';
        const connectedPaths = [
            device?.InternetGatewayDevice?.LANDevice?.[1]?.WLANConfiguration?.[1]?.TotalAssociations?._value,
            device?.VirtualParameters?.ConnectedDevices?._value,
            device?.Device?.WiFi?.AccessPoint?.[1]?.AssociatedDeviceNumberOfEntries?._value
        ];

        for (const path of connectedPaths) {
            if (path !== undefined && path !== null) {
                userConnected = path.toString();
                break;
            }
        }

        const deviceData = {
            username: req.session.username,
            model: model || 'HG8245A',
            serialNumber: serialNumber || 'N/A',
            ssid: ssid,
            userConnected: userConnected
        };

        // Debug log
        console.log('Processed device data:', deviceData);

        res.render('dashboard', { deviceData, error: null });

    } catch (error) {
        console.error('Dashboard error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            stack: error.stack
        });

        const [manufacturer, model, serialNumber] = req.session.deviceId.split('-');

        res.render('dashboard', { 
            deviceData: {
                username: req.session.username,
                model: model || 'HG8245A',
                serialNumber: serialNumber || 'N/A',
                ssid: 'N/A',
                userConnected: '0'
            },
            error: `Gagal mengambil data perangkat: ${error.message}`
        });
    }
});

// Update WiFi settings (dipisah menjadi dua endpoint)
app.post('/update-wifi/ssid', async (req, res) => {
    if (!req.session.username || !req.session.deviceId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ssid } = req.body;
    const deviceId = encodeURIComponent(req.session.deviceId);
    
    try {
        const task = {
            name: "setParameterValues",
            parameterValues: [
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", ssid, "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable", "1", "xsd:boolean"]
            ]
        };

        await axios.post(
            `${process.env.GENIEACS_URL}/devices/${deviceId}/tasks`,
            task,
            {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            }
        );

        res.json({ success: true, message: 'SSID berhasil diupdate' });
    } catch (error) {
        console.error('Update SSID error:', error);
        res.status(500).json({ success: false, error: 'Gagal mengupdate SSID' });
    }
});

app.post('/update-wifi/password', async (req, res) => {
    if (!req.session.username || !req.session.deviceId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { password } = req.body;
    const deviceId = encodeURIComponent(req.session.deviceId);
    
    try {
        const task = {
            name: "setParameterValues",
            parameterValues: [
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType", "WPAand11i", "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPAAuthenticationMode", "PSKAuthentication", "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPAEncryptionModes", "AESEncryption", "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", password, "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.Enable", "1", "xsd:boolean"]
            ]
        };

        await axios.post(
            `${process.env.GENIEACS_URL}/devices/${deviceId}/tasks`,
            task,
            {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            }
        );

        // Tambahkan task reboot
        await axios.post(
            `${process.env.GENIEACS_URL}/devices/${deviceId}/tasks`,
            { name: "reboot" },
            {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            }
        );

        res.json({ success: true, message: 'Password berhasil diupdate. Device akan direstart.' });
    } catch (error) {
        console.error('Update password error:', error);
        res.status(500).json({ success: false, error: 'Gagal mengupdate password' });
    }
});

// Admin credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Admin login page
app.get('/admin', (req, res) => {
    if (req.session.isAdmin) {
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin-login', { error: null });
    }
});

// Admin login handler
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin-login', { error: 'Invalid credentials' });
    }
});

// Admin dashboard
app.get('/admin/dashboard', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin');
    }

    try {
        // Get all devices with query
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            params: {
                query: JSON.stringify({}),  // Empty query to get all devices
                projection: JSON.stringify({
                    "_id": 1,
                    "_tags": 1
                })
            },
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        const devices = response.data.map(device => ({
            _id: device._id,
            Tags: device._tags || []
        }));

        res.render('admin', { devices });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.render('admin', { devices: [], error: 'Failed to fetch devices' });
    }
});

// Assign tag route
app.post('/assign-tag', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { deviceId, tag } = req.body;
        
        console.log('Attempting to assign tag:', {
            deviceId,
            tag
        });

        const encodedDeviceId = encodeURIComponent(deviceId);
        const encodedTag = encodeURIComponent(tag);

        // Assign tag using POST request
        await axios({
            method: 'post',
            url: `${process.env.GENIEACS_URL}/devices/${encodedDeviceId}/tags/${encodedTag}`,
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            },
            headers: {
                'Content-Type': 'application/json'
            }
        });

        res.json({ success: true, message: 'Tag assigned successfully' });
    } catch (error) {
        console.error('Error assigning tag:', error);
        res.status(500).json({ error: 'Failed to assign tag' });
    }
});

// Delete tag route
app.post('/delete-tag', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { deviceId, tag } = req.body;
        const encodedDeviceId = encodeURIComponent(deviceId);
        const encodedTag = encodeURIComponent(tag);

        // Delete tag using DELETE request
        await axios({
            method: 'delete',
            url: `${process.env.GENIEACS_URL}/devices/${encodedDeviceId}/tags/${encodedTag}`,
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete tag error:', error);
        res.status(500).json({ error: 'Failed to delete tag' });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Tambahkan fungsi untuk memformat uptime
function formatUptime(uptimeStr) {
    if (!uptimeStr) return 'N/A';
    
    // Jika uptimeStr sudah dalam format yang diinginkan, langsung kembalikan
    if (typeof uptimeStr === 'string' && uptimeStr.includes('hari')) {
        return uptimeStr;
    }

    // Jika dalam bentuk detik, konversi
    const seconds = parseInt(uptimeStr);
    if (isNaN(seconds)) return uptimeStr;
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    let uptime = '';
    if (days > 0) uptime += `${days} hari `;
    if (hours > 0) uptime += `${hours} jam `;
    if (minutes > 0) uptime += `${minutes} menit`;
    
    return uptime.trim() || 'Baru saja';
}

// Tambahkan fungsi helper untuk mengambil nilai parameter
function getParameterValue(device, paths) {
    for (let path of paths) {
        const keys = path.split('.');
        let value = device;
        
        for (let key of keys) {
            value = value?.[key];
            if (!value) break;
        }
        
        if (value?._value !== undefined) {
            return value._value;
        }
    }
    
    return null;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});