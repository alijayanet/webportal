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
        // Get device details with virtual parameters
        const deviceResponse = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            params: {
                query: JSON.stringify({
                    "_id": req.session.deviceId
                }),
                projection: JSON.stringify({
                    "_id": 1,
                    "_tags": 1,
                    "_deviceId": 1,
                    "_lastInform": 1,
                    "_registered": 1,
                    "_lastBoot": 1,
                    "VirtualParameters": 1,
                    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID._value": 1,
                    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username._value": 1,
                    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress._value": 1,
                    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.PONONU.OpticalSignalLevel._value": 1,
                    "InternetGatewayDevice.DeviceInfo.TemperatureStatus.TemperatureValue._value": 1,
                    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations._value": 1,
                    "InternetGatewayDevice.DeviceInfo.UpTime._value": 1
                })
            },
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        if (!deviceResponse.data || !deviceResponse.data.length) {
            throw new Error('Device not found');
        }

        const device = deviceResponse.data[0];
        console.log('Raw device data:', JSON.stringify(device, null, 2));

        // Extract values from device data
        const deviceData = {
            username: req.session.username,
            id: device._id,
            manufacturer: device._deviceId?._Manufacturer || 'N/A',
            model: device._deviceId?._ProductClass || 'N/A',
            serialNumber: device._deviceId?._SerialNumber || 'N/A',
            macAddress: device.VirtualParameters?.MacAddress?._value || 'N/A',
            ponMode: device.VirtualParameters?.PonMode?._value || 'N/A',
            pppoeUsername: device.VirtualParameters?.pppUsername?._value || 
                          device["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username"]?._value || 'N/A',
            ipAddress: device.VirtualParameters?.pppIP?._value || 
                      device["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress"]?._value || 'N/A',
            ssid: device.VirtualParameters?.ssid?._value || 
                  device["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID"]?._value || 'N/A',
            rxPower: device.VirtualParameters?.redaman?._value || 
                    device["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.PONONU.OpticalSignalLevel"]?._value || 'N/A',
            tags: device._tags || [],
            userConnected: device.VirtualParameters?.userconnected?._value || 
                          device["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations"]?._value || 'N/A',
            activeDevices: device.VirtualParameters?.activedevices?._value || 'N/A',
            uptime: device.VirtualParameters?.uptimeDevice?._value || 
                    device["InternetGatewayDevice.DeviceInfo.UpTime"]?._value || 'N/A',
            temperature: device.VirtualParameters?.temp?._value || 
                        device["InternetGatewayDevice.DeviceInfo.TemperatureStatus.TemperatureValue"]?._value || 'N/A',
            lastBoot: device._lastBoot ? new Date(device._lastBoot).toLocaleString('id-ID') : 'N/A',
            lastInform: device._lastInform ? new Date(device._lastInform).toLocaleString('id-ID') : 'N/A'
        };

        console.log('Processed device data:', deviceData);
        res.render('dashboard', { deviceData, error: null });

    } catch (error) {
        console.error('Dashboard error:', error);
        console.error('Error details:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });

        res.render('dashboard', { 
            deviceData: {
                username: req.session.username,
                id: req.session.deviceId,
                manufacturer: 'N/A',
                model: 'N/A',
                serialNumber: 'N/A',
                macAddress: 'N/A',
                ponMode: 'N/A',
                pppoeUsername: 'N/A',
                ipAddress: 'N/A',
                ssid: 'N/A',
                rxPower: 'N/A',
                tags: [],
                userConnected: 'N/A',
                activeDevices: 'N/A',
                uptime: 'N/A',
                temperature: 'N/A',
                lastBoot: 'N/A',
                lastInform: 'N/A'
            },
            error: `Gagal mengambil data perangkat: ${error.message}`
        });
    }
});

// Update WiFi settings
app.post('/update-wifi', async (req, res) => {
    if (!req.session.username || !req.session.deviceId) {
        console.log('Unauthorized attempt to update WiFi settings');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ssid, password } = req.body;
    const deviceId = encodeURIComponent(req.session.deviceId);
    
    console.log('Received WiFi update request:', {
        deviceId,
        ssid,
        hasPassword: !!password,
        sessionUsername: req.session.username
    });
    
    try {
        // Buat task untuk update WiFi settings
        const task = {
            name: "setParameterValues",
            parameterValues: []
        };

        // Tambahkan SSID jika ada
        if (ssid) {
            console.log('Adding SSID to task:', ssid);
            task.parameterValues.push([
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
                ssid,
                "xsd:string"
            ]);

            // Enable WiFi jika mengubah SSID
            task.parameterValues.push([
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable",
                "1",
                "xsd:boolean"
            ]);
        }

        // Tambahkan password jika ada
        if (password) {
            console.log('Adding password to task');
            // Set security mode to WPA2-PSK
            task.parameterValues.push([
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType",
                "WPAand11i",
                "xsd:string"
            ]);

            // Set WPA/WPA2 mode
            task.parameterValues.push([
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPAAuthenticationMode",
                "PSKAuthentication",
                "xsd:string"
            ]);

            // Set encryption type ke AES
            task.parameterValues.push([
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPAEncryptionModes",
                "AESEncryption",
                "xsd:string"
            ]);

            // Set password
            task.parameterValues.push([
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey",
                password,
                "xsd:string"
            ]);

            // Enable password encryption
            task.parameterValues.push([
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.Enable",
                "1",
                "xsd:boolean"
            ]);
        }

        if (task.parameterValues.length === 0) {
            console.log('No changes requested');
            return res.json({ 
                success: false, 
                error: 'No changes requested' 
            });
        }

        console.log('Sending task to GenieACS:', JSON.stringify(task, null, 2));
        console.log('Device ID:', deviceId);

        try {
            // Verifikasi device terlebih dahulu
            const deviceCheck = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
                params: {
                    query: JSON.stringify({ "_id": deviceId })
                },
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            });
            
            if (!deviceCheck.data || !deviceCheck.data.length) {
                throw new Error('Device not found');
            }
            
            console.log('Device found:', deviceCheck.data[0]);

            // Kirim task ke GenieACS
            const taskUrl = `${process.env.GENIEACS_URL}/devices/${deviceId}/tasks`;
            console.log('Sending task to:', taskUrl);
            
            const response = await axios({
                method: 'post',
                url: taskUrl,
                data: task,
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('GenieACS task response:', response.data);

            // Tunggu sebentar untuk memastikan perubahan diterapkan
            console.log('Waiting for changes to apply...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Verifikasi perubahan
            console.log('Verifying changes...');
            const verifyResponse = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
                params: {
                    query: JSON.stringify({ "_id": deviceId })
                },
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            });

            if (!verifyResponse.data || !verifyResponse.data.length) {
                throw new Error('Failed to verify changes');
            }

            console.log('Verification response:', JSON.stringify(verifyResponse.data[0], null, 2));

            // Tambahkan task reboot jika ada perubahan password
            if (password) {
                console.log('Adding reboot task...');
                await axios({
                    method: 'post',
                    url: taskUrl,
                    data: {
                        name: "reboot"
                    },
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }

            res.json({ 
                success: true, 
                message: password ? 
                    'Pengaturan WiFi berhasil diupdate. Device akan direstart.' : 
                    'SSID berhasil diupdate.'
            });
        } catch (axiosError) {
            console.error('Axios error:', {
                message: axiosError.message,
                status: axiosError.response?.status,
                statusText: axiosError.response?.statusText,
                data: axiosError.response?.data,
                url: axiosError.config?.url,
                method: axiosError.config?.method,
                requestData: axiosError.config?.data
            });
            throw axiosError;
        }
    } catch (error) {
        console.error('Update WiFi error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            stack: error.stack
        });
        res.status(500).json({ 
            success: false, 
            error: `Gagal mengupdate pengaturan WiFi: ${error.message}`
        });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});