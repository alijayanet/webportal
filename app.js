const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
const InternetPackage = require('./models/InternetPackage');
const PaymentStatus = require('./models/PaymentStatus');
const mongoose = require('mongoose');
const whatsappRoutes = require('./routes/whatsapp');
const { router: whatsappRouter, wss } = require('./routes/whatsapp');
const server = require('http').createServer(app);

const app = express();

// Middleware
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'rahasia-session',
    resave: false,
    saveUninitialized: true
}));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
        if (req.method === 'POST') {
            console.log('POST Body:', req.body);
            if (req.rawBody) console.log('Raw Body:', req.rawBody);
        }
    });
    next();
});

// Register WhatsApp routes BEFORE other routes
app.use('/whatsapp', whatsappRoutes);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Set strictQuery option to suppress warning
mongoose.set('strictQuery', false);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ont_manager';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Terhubung ke MongoDB');
}).catch((err) => {
    console.error('Gagal terhubung ke MongoDB:', err.message);
});

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

        // Find device with matching username tag
        const device = response.data.find(d => {
            // Cek username tag (tanpa prefix)
            const usernameTag = d._tags?.find(tag => !tag.startsWith('wa:'));
            return usernameTag === username;
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
            res.render('login', { error: 'Nomor pelanggan tidak ditemukan' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { error: 'Terjadi kesalahan saat menghubungi server' });
    }
});

// Update parameter paths untuk Product Class/Model
const parameterPaths = {
    pppUsername: [
        'VirtualParameters.pppoeUsername',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username'
    ],
    rxPower: [
        'VirtualParameters.RXPower',
        'VirtualParameters.redaman',
        'InternetGatewayDevice.WANDevice.1.WANPONInterfaceConfig.RXPower'
    ],
    pppMac: [
        'VirtualParameters.pppMac',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.MACAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.2.MACAddress',
        'Device.IP.Interface.1.IPv4Address.1.IPAddress'
    ],
    pppMacWildcard: [
        'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.1.WANPPPConnection.*.MACAddress',
        'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.1.WANIPConnection.*.MACAddress'
    ],
    pppoeIP: [
        'VirtualParameters.pppoeIP',
        'VirtualParameters.pppIP'
    ],
    tr069IP: [
        'VirtualParameters.IPTR069'
    ],
    ssid: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'
    ],
    userConnected: [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'
    ],
    uptime: [
        'VirtualParameters.getdeviceuptime'
    ],
    productClass: [
        'DeviceID.ProductClass',
        'InternetGatewayDevice.DeviceInfo.ProductClass',
        'Device.DeviceInfo.ProductClass',
        'InternetGatewayDevice.DeviceInfo.ModelName',
        'Device.DeviceInfo.ModelName'
    ],
    serialNumber: [
        'DeviceID.SerialNumber',
        'InternetGatewayDevice.DeviceInfo.SerialNumber',
        'Device.DeviceInfo.SerialNumber'
    ],
    registeredTime: [
        'Events.Registered'
    ]
};

// Update helper function untuk cek status device
const getDeviceStatus = (lastInform) => {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 menit dalam milliseconds
    const lastInformTime = new Date(lastInform).getTime();
    
    return (now - lastInformTime) <= fiveMinutes;
};

// Dashboard route
app.get('/dashboard', async (req, res) => {
    if (!req.session.username || !req.session.deviceId) {
        return res.redirect('/');
    }

    try {
        const deviceResponse = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            params: {
                query: JSON.stringify({ "_id": req.session.deviceId })
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

        // Get device status
        const lastInform = device._lastInform;
        const deviceStatus = getDeviceStatus(lastInform);

        // Get Product Class/Model
        let model = getParameterWithPaths(device, parameterPaths.productClass);
        
        // Fallback ke device ID jika tidak ditemukan
        if (model === 'N/A') {
            const deviceIdParts = req.session.deviceId.split('-');
            if (deviceIdParts.length >= 2) {
                model = deviceIdParts[1];
            }
        }

        // Get Serial Number
        let serialNumber = getParameterWithPaths(device, parameterPaths.serialNumber);
        if (serialNumber === 'N/A') {
            const deviceIdParts = req.session.deviceId.split('-');
            if (deviceIdParts.length >= 3) {
                serialNumber = deviceIdParts[2];
            }
        }

        // Get device data
        const deviceData = {
            id: req.session.deviceId,
            username: req.session.username,
            model: model,
            serialNumber: serialNumber,
            pppUsername: getParameterWithPaths(device, parameterPaths.pppUsername),
            pppMac: getParameterWithPaths(device, [...parameterPaths.pppMac, ...parameterPaths.pppMacWildcard]),
            pppoeIP: getParameterWithPaths(device, parameterPaths.pppoeIP),
            tr069IP: getParameterWithPaths(device, parameterPaths.tr069IP),
            ssid: getParameterWithPaths(device, parameterPaths.ssid),
            userConnected: getParameterWithPaths(device, parameterPaths.userConnected) || '0',
            rxPower: getParameterWithPaths(device, parameterPaths.rxPower),
            uptime: getParameterWithPaths(device, parameterPaths.uptime),
            registeredTime: getParameterWithPaths(device, parameterPaths.registeredTime),
            status: deviceStatus ? 'online' : 'offline',
            statusLabel: deviceStatus ? 'Online' : 'Offline',
            statusColor: deviceStatus ? '#33ff33' : '#ff0000',
            lastInform: new Date(lastInform || Date.now()).toLocaleString(),
            manufacturer: device.DeviceID?.Manufacturer || 'N/A'
        };

        // Clean up model name if needed
        deviceData.model = deviceData.model.replace('%2D', '-');

        console.log('Processed device data:', deviceData);

        // Tambahkan data paket dan pembayaran
        const paymentStatus = await PaymentStatus.findOne({ deviceId: deviceData.id })
            .populate('packageId');
        
        console.log('Payment status:', paymentStatus);

        if (paymentStatus && paymentStatus.packageId) {
            deviceData.internetPackage = {
                name: paymentStatus.packageId.name,
                speed: paymentStatus.packageId.speed,
                price: paymentStatus.packageId.price
            };
            deviceData.paymentStatus = {
                isPaid: paymentStatus.isPaid,
                lastPaymentDate: paymentStatus.lastPaymentDate
            };
        } else {
            deviceData.internetPackage = null;
            deviceData.paymentStatus = {
                isPaid: false,
                lastPaymentDate: null
            };
        }

        res.render('dashboard', { deviceData, error: null });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard', { 
            deviceData: {
                username: req.session.username,
                status: 'unknown',
                statusLabel: 'Unknown',
                statusColor: '#999999'
            },
            error: error.message 
        });
    }
});

// Helper function to format uptime
function formatUptime(seconds) {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// Helper function to get nested value with multiple possible paths
const getParameterWithPaths = (device, paths) => {
    try {
        if (!device) {
            console.warn('Device object is null or undefined');
            return 'N/A';
        }

        for (const path of paths) {
            console.log(`Checking path: ${path}`);
            
            // Handle DeviceID special case
            if (path.startsWith('DeviceID.')) {
                const property = path.split('.')[1];
                if (device.DeviceID && device.DeviceID[property] !== undefined) {
                    const value = device.DeviceID[property];
                    console.log(`Found DeviceID value at ${path}:`, value);
                    // Clean up encoded characters if any
                    return typeof value === 'string' ? value.replace('%2D', '-') : value;
                }
            }
            
            // Handle wildcard paths
            if (path.includes('*')) {
                const parts = path.split('.');
                let current = device;
                let found = true;
                
                for (const part of parts) {
                    if (!current) {
                        found = false;
                        break;
                    }

                    if (part === '*') {
                        // Get all numeric keys
                        const keys = Object.keys(current || {}).filter(k => !isNaN(k));
                        // Try each key until we find a value
                        for (const key of keys) {
                            const temp = current[key];
                            if (temp?._value !== undefined) {
                                current = temp;
                                found = true;
                                break;
                            }
                            current = temp;
                        }
                        if (!current) {
                            found = false;
                            break;
                        }
                    } else {
                        current = current[part];
                    }
                }
                
                if (found && current?._value !== undefined) {
                    console.log(`Found value at ${path}:`, current._value);
                    return current._value;
                }
            } else {
                // Direct path
                const value = getNestedValue(device, path);
                if (value !== undefined) {
                    console.log(`Found value at ${path}:`, value);
                    return value;
                }
            }
        }

        console.log('No value found in any path');
        return 'N/A';
    } catch (error) {
        console.error(`Error getting value for path ${paths}:`, error);
        return 'N/A';
    }
};

// Function to safely get nested value
const getNestedValue = (obj, path) => {
    try {
        if (!obj || !path) return undefined;
        
        // Handle root level properties
        if (path.startsWith('_')) {
            return obj[path];
        }

        let current = obj;
        const parts = path.split('.');
        
        for (const part of parts) {
            if (!current) return undefined;
            current = current[part];
        }
        
        return current?._value;
    } catch (error) {
        console.error(`Error getting value for path ${path}:`, error);
        return undefined;
    }
};

// Helper function to encode device ID properly
function encodeDeviceId(deviceId) {
    // First decode to handle any existing encoding
    const decodedId = decodeURIComponent(deviceId);
    // Then encode properly for URL
    return encodeURIComponent(decodedId);
}

// Update SSID endpoint
app.post('/update-wifi', async (req, res) => {
    try {
        const { ssid, password } = req.body;
        const deviceId = req.session.deviceId;

        console.log('Update WiFi Request:', {
            deviceId,
            ssid,
            password: password ? '********' : undefined
        });

        if (!deviceId) {
            throw new Error('Device ID tidak valid');
        }

        // Cek device terlebih dahulu
        const deviceCheck = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            params: {
                query: JSON.stringify({ "_id": deviceId })
            },
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        if (!deviceCheck.data || deviceCheck.data.length === 0) {
            throw new Error('Device tidak ditemukan');
        }

        const actualDeviceId = deviceCheck.data[0]._id;
        console.log('Actual device ID from server:', actualDeviceId);

        // Update SSID atau Password
        const parameterValues = [];
        
        if (ssid) {
            parameterValues.push(
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", ssid, "xsd:string"]
            );
        }

        if (password) {
            // Sesuai dengan virtual parameter
            parameterValues.push(
                // Primary password paths
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", password, "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", password, "xsd:string"],
                // Additional paths untuk memastikan password terupdate
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", password, "xsd:string"]
            );

            // Tambah task untuk refresh setelah update password
            const refreshTasks = [
                {
                    name: "refreshObject",
                    objectName: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1"
                },
                {
                    name: "refreshObject",
                    objectName: "VirtualParameters.wifiPassword"
                }
            ];

            // Kirim task refresh
            for (const task of refreshTasks) {
                try {
                    await axios.post(
                        `${process.env.GENIEACS_URL}/devices/${encodeURIComponent(actualDeviceId)}/tasks`,
                        task,
                        {
                            auth: {
                                username: process.env.GENIEACS_USERNAME,
                                password: process.env.GENIEACS_PASSWORD
                            }
                        }
                    );
                    console.log(`Refresh task sent: ${task.objectName}`);
                } catch (refreshError) {
                    console.warn(`Warning: Failed to send refresh task for ${task.objectName}:`, refreshError.message);
                }
            }
        }

        if (parameterValues.length > 0) {
            // Kirim update parameter
            const response = await axios.post(
                `${process.env.GENIEACS_URL}/devices/${encodeURIComponent(actualDeviceId)}/tasks`,
                {
                    name: "setParameterValues",
                    parameterValues: parameterValues
                },
                {
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    }
                }
            );

            console.log('Update response:', response.status, response.data);

            // Tunggu sebentar untuk memastikan perubahan diterapkan
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Kirim connection request untuk memastikan perubahan diterapkan
            try {
                await axios.post(
                    `${process.env.GENIEACS_URL}/devices/${encodeURIComponent(actualDeviceId)}/tasks?connection_request`,
                    {},
                    {
                        auth: {
                            username: process.env.GENIEACS_USERNAME,
                            password: process.env.GENIEACS_PASSWORD
                        }
                    }
                );
            } catch (connError) {
                console.warn('Warning: Connection request failed:', connError.message);
            }
        }

        res.json({ success: true, message: 'Pengaturan WiFi berhasil diupdate' });

    } catch (error) {
        console.error('Update WiFi error:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            config: {
                url: error.config?.url,
                method: error.config?.method,
                data: error.config?.data
            }
        });
        
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Gagal mengupdate pengaturan WiFi'
        });
    }
});

// Tambahkan helper function untuk RX Power class
const getRxPowerClass = (rxPower) => {
    if (!rxPower) return '';
    const power = parseFloat(rxPower);
    if (power > -25) return 'rx-power-good';
    if (power > -27) return 'rx-power-warning';
    return 'rx-power-critical';
};

// Tambahkan fungsi getDevices sebelum route admin
async function getDevices() {
    try {
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        return response.data.map(device => {
            // Cek status berdasarkan last inform time
            const isOnline = getDeviceStatus(device._lastInform);
            
            // Get connected devices count
            const connectedDevices = getParameterWithPaths(device, [
                'InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries',
                'Device.Hosts.HostNumberOfEntries'
            ]) || '0';

            return {
                _id: device._id,
                online: isOnline,
                lastInform: device._lastInform || new Date(),
                pppUsername: getParameterWithPaths(device, parameterPaths.pppUsername) || 'Unknown',
                pppoeIP: getParameterWithPaths(device, parameterPaths.pppoeIP) || 'N/A',
                rxPower: getParameterWithPaths(device, parameterPaths.rxPower) || 'N/A',
                model: getParameterWithPaths(device, parameterPaths.productClass) || 'N/A',
                serialNumber: getParameterWithPaths(device, parameterPaths.serialNumber) || 'N/A',
                connectedDevices: connectedDevices
            };
        });
    } catch (error) {
        console.error('Error getting devices:', error);
        throw new Error('Gagal mengambil data perangkat');
    }
}

// Update admin route
app.get('/admin', isAdmin, async (req, res) => {
    try {
        const devices = await getDevices();
        const packages = await InternetPackage.find();
        const paymentStatuses = await PaymentStatus.find().populate('packageId');
        
        const devicesWithPackages = devices.map(device => {
            const paymentStatus = paymentStatuses.find(ps => ps.deviceId === device._id);
            if (paymentStatus) {
                device.internetPackage = paymentStatus.packageId;
                device.paymentStatus = {
                    isPaid: paymentStatus.isPaid,
                    lastPaymentDate: paymentStatus.lastPaymentDate
                };
            }
            return device;
        });

        res.render('admin', { 
            devices: devicesWithPackages,
            packages,
            getRxPowerClass, // Tambahkan ini kembali karena digunakan di template
            error: null 
        });
    } catch (error) {
        console.error('Admin page error:', error);
        res.render('admin', { 
            devices: [],
            packages: [],
            getRxPowerClass, // Tambahkan ini kembali
            error: error.message 
        });
    }
});

// Admin login route
app.get('/admin/login', (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin');
    }
    res.render('admin-login', { error: null });
});

app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        if (username === process.env.ADMIN_USERNAME && 
            password === process.env.ADMIN_PASSWORD) {
            req.session.isAdmin = true;
            return res.redirect('/admin');
        }
        res.render('admin-login', { error: 'Username atau password salah' });
    } catch (error) {
        console.error('Admin login error:', error);
        res.render('admin-login', { error: 'Terjadi kesalahan saat login' });
    }
});

// Update logout to handle admin session
app.get('/logout', (req, res) => {
    if (req.session.isAdmin) {
        req.session.destroy();
        return res.redirect('/admin/login');
    }
    req.session.destroy();
    res.redirect('/');
});

// Add this endpoint to handle device refresh
app.post('/refresh-device', async (req, res) => {
    try {
        const deviceId = req.session.deviceId;
        
        if (!deviceId) {
            throw new Error('Device ID tidak valid');
        }

        const encodedDeviceId = encodeURIComponent(deviceId);
        console.log('Refreshing device:', encodedDeviceId);

        // Refresh all parameters
        await axios.post(
            `${process.env.GENIEACS_URL}/devices/${encodedDeviceId}/tasks?connection_request`,
            {
                name: "refreshObject",
                objectName: ""  // Empty string means refresh all parameters
            },
            {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            }
        );

        // Wait for refresh to complete
        await new Promise(resolve => setTimeout(resolve, 3000));

        res.json({ 
            success: true, 
            message: 'Device berhasil di-refresh' 
        });

    } catch (error) {
        console.error('Refresh device error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.status(500).json({ 
            success: false, 
            message: `Gagal me-refresh device: ${error.message}` 
        });
    }
});

// Refresh single device
app.post('/admin/refresh-device/:deviceId', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Get original deviceId from GenieACS
        const originalDeviceId = req.params.deviceId
            .replace(/%252D/g, '-')  // Fix double encoding
            .replace(/%2D/g, '-')    // Fix single encoding
            .replace(/%20/g, ' ')    // Fix spaces
            .replace(/\+/g, ' ');    // Fix plus signs

        console.log('Request deviceId:', req.params.deviceId);
        console.log('Processed deviceId:', originalDeviceId);

        // Construct GenieACS URLs
        const baseUrl = process.env.GENIEACS_URL.replace(/\/$/, ''); // Remove trailing slash if exists
        const refreshUrl = `${baseUrl}/devices/${originalDeviceId}/tasks`;
        const connectionUrl = `${baseUrl}/devices/${originalDeviceId}/tasks?connection_request`;

        console.log('Refresh URL:', refreshUrl);
        console.log('Connection URL:', connectionUrl);

        // Verify device exists first
        try {
            const deviceCheck = await axios.get(`${baseUrl}/devices/${originalDeviceId}`, {
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            });

            if (!deviceCheck.data) {
                throw new Error('Device not found in GenieACS');
            }

            console.log('Device found in GenieACS');

            // Send refresh task
            const refreshResponse = await axios.post(
                refreshUrl,
                {
                    name: "refreshObject",
                    objectName: ""
                },
                {
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Refresh task response:', refreshResponse.status);

            // Send connection request
            const connectionResponse = await axios.post(
                connectionUrl,
                {},
                {
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Connection request response:', connectionResponse.status);

            // Wait for tasks to be processed
            await new Promise(resolve => setTimeout(resolve, 3000));

            res.json({ 
                success: true, 
                message: 'Device refreshed successfully',
                deviceId: originalDeviceId
            });

        } catch (axiosError) {
            console.error('GenieACS API error:', {
                url: axiosError.config?.url,
                status: axiosError.response?.status,
                data: axiosError.response?.data,
                message: axiosError.message
            });
            
            let errorMessage = 'GenieACS API error';
            if (axiosError.response?.status === 404) {
                errorMessage = 'Device not found in GenieACS';
            } else if (axiosError.response?.data?.message) {
                errorMessage = axiosError.response.data.message;
            } else {
                errorMessage = axiosError.message;
            }

            throw new Error(errorMessage);
        }

    } catch (error) {
        console.error('Refresh device error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to refresh device: ' + error.message,
            deviceId: req.params.deviceId,
            error: error.message
        });
    }
});

// Refresh all devices
app.post('/admin/refresh-all', async (req, res) => {
    try {
        if (!req.session.isAdmin) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Ambil semua devices
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        const refreshPromises = response.data.map(async (device) => {
            try {
                // Kirim refresh task
                await axios.post(
                    `${process.env.GENIEACS_URL}/devices/${encodeURIComponent(device._id)}/tasks`,
                    {
                        name: "refreshObject",
                        objectName: ""
                    },
                    {
                        auth: {
                            username: process.env.GENIEACS_USERNAME,
                            password: process.env.GENIEACS_PASSWORD
                        }
                    }
                );

                // Kirim connection request
                await axios.post(
                    `${process.env.GENIEACS_URL}/devices/${encodeURIComponent(device._id)}/tasks?connection_request`,
                    {},
                    {
                        auth: {
                            username: process.env.GENIEACS_USERNAME,
                            password: process.env.GENIEACS_PASSWORD
                        }
                    }
                );

                return { deviceId: device._id, success: true };
            } catch (error) {
                console.warn(`Failed to refresh device ${device._id}:`, error.message);
                return { deviceId: device._id, success: false, error: error.message };
            }
        });

        // Tunggu semua refresh selesai
        const results = await Promise.allSettled(refreshPromises);

        // Hitung statistik
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;

        res.json({ 
            success: true, 
            message: `Refresh completed. Success: ${successful}, Failed: ${failed}`,
            details: results.map(r => r.value || r.reason)
        });

    } catch (error) {
        console.error('Refresh all devices error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to refresh devices: ' + error.message 
        });
    }
});

// Endpoint untuk manajemen paket internet
app.post('/admin/packages', isAdmin, async (req, res) => {
    try {
        const { name, speed, price } = req.body;
        const newPackage = new InternetPackage({ name, speed, price });
        await newPackage.save();
        res.json({ success: true, message: 'Paket berhasil ditambahkan' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/admin/packages/:id', isAdmin, async (req, res) => {
    try {
        await InternetPackage.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Paket berhasil dihapus' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/admin/assign-package', isAdmin, async (req, res) => {
    try {
        const { deviceId, packageId } = req.body;
        
        // Update atau buat status pembayaran baru
        await PaymentStatus.findOneAndUpdate(
            { deviceId },
            { 
                deviceId,
                packageId,
                isPaid: false // Reset status pembayaran saat assign paket baru
            },
            { upsert: true }
        );
        
        res.json({ success: true, message: 'Paket berhasil di-assign' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/admin/update-payment', isAdmin, async (req, res) => {
    try {
        const { deviceId } = req.body;
        
        await PaymentStatus.findOneAndUpdate(
            { deviceId },
            { 
                isPaid: true,
                lastPaymentDate: new Date()
            }
        );
        
        res.json({ success: true, message: 'Status pembayaran berhasil diupdate' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

function isAdmin(req, res, next) {
    if (req.session.isAdmin) {
        next();
    } else {
        res.redirect('/admin/login');
    }
}

// Error handling middleware (tambahkan sebelum app.listen)
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: err.message 
    });
});

// 404 handler (tambahkan sebelum error handling)
app.use((req, res) => {
    console.log('404 - Not Found:', req.url);
    res.status(404).json({ 
        success: false, 
        message: 'Route not found' 
    });
});

// Setup WebSocket
server.on('upgrade', (request, socket, head) => {
    if (request.url === '/whatsapp/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }
});

// Initialize WhatsApp
const whatsappService = require('./config/whatsapp-baileys');
whatsappService.initialize().catch(console.error);

const PORT = process.env.PORT || 3100;
server.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} sudah digunakan. Pastikan tidak ada proses lain yang menggunakan port ini.`);
        console.log('Coba gunakan perintah: sudo lsof -i :' + PORT);
        process.exit(1);
    } else {
        console.error('Server error:', err);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.info('SIGTERM signal received.');
    console.log('Closing HTTP server...');
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });
});