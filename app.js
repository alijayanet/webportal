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
        console.log('Fetching device data for:', req.session.deviceId);

        // Use the correct endpoint with query parameter
        const deviceResponse = await axios.get(`${process.env.GENIEACS_URL}/devices/`, {
            params: {
                query: JSON.stringify({ "_id": req.session.deviceId })
            },
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        if (!deviceResponse.data || !Array.isArray(deviceResponse.data) || deviceResponse.data.length === 0) {
            throw new Error('Device not found');
        }

        const device = deviceResponse.data[0];

        // Helper function to get RX Power
        async function getRxPower(device) {
            console.log('Getting RX Power for device:', device._id);
            
            // Get device manufacturer
            const manufacturer = device.InternetGatewayDevice?.DeviceInfo?.Manufacturer;
            console.log('Device manufacturer:', manufacturer);

            // List of possible RX Power paths based on manufacturer
            const rxPowerPaths = [
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower',
                'InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.RXPower',
                'InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RXPower'
            ];

            let rxPower = null;

            // Check each path
            for (const path of rxPowerPaths) {
                console.log('Checking path:', path);
                const value = getNestedValue(device, path);
                
                if (value !== undefined && value !== null) {
                    console.log('Found RX Power value:', value, 'in path:', path);
                    rxPower = value;
                    break;
                }
            }

            // If no value found, return N/A
            if (rxPower === null) {
                console.log('No valid RX Power found in any path');
                return 'N/A';
            }

            // Calculate RX Power value
            try {
                const numericValue = parseFloat(rxPower);
                if (!isNaN(numericValue) && numericValue >= 0) {
                    const calculatedValue = Math.ceil(10 * Math.log10(numericValue / 10000));
                    if (!isNaN(calculatedValue)) {
                        console.log('Calculated RX Power:', calculatedValue);
                        return calculatedValue.toString();
                    }
                }
            } catch (error) {
                console.error('Error calculating RX Power:', error);
            }

            // Return original value if calculation fails
            return rxPower.toString();
        }

        // Helper function to find paths containing specific keys
        const findPathsWithKey = (obj, searchKeys, currentPath = '', results = []) => {
            if (!obj || typeof obj !== 'object') return results;
            
            for (const key in obj) {
                const newPath = currentPath ? `${currentPath}.${key}` : key;
                
                if (searchKeys.some(searchKey => key.includes(searchKey))) {
                    results.push(newPath);
                }
                
                if (obj[key] && typeof obj[key] === 'object') {
                    findPathsWithKey(obj[key], searchKeys, newPath, results);
                }
            }
            
            return results;
        };

        // Log the full device object to see its structure
        console.log('Full device data structure:', JSON.stringify(device, null, 2));

        // Helper function to convert uptime to temperature (assuming it follows the pattern)
        const convertToTemperature = (uptime) => {
            if (!uptime) return 'N/A';
            // Assuming the last two digits represent temperature
            const temp = uptime % 100;
            return temp > 0 && temp < 100 ? temp : 'N/A';
        };

        // Extract all required parameters
        const deviceData = {
            status: getNestedValue(device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus') || 'Disconnected',
            ponMode: getNestedValue(device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus'),
            pppUsername: getNestedValue(device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username'),
            ssid: getNestedValue(device, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'),
            password: getNestedValue(device, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase'),
            userConnected: getNestedValue(device, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'),
            rxPower: await getRxPower(device),
            pppIP: getNestedValue(device, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress'),
            productClass: getNestedValue(device, 'InternetGatewayDevice.DeviceInfo.ModelName'),
            temp: convertToTemperature(getNestedValue(device, 'InternetGatewayDevice.DeviceInfo.UpTime')),
            tr069IP: getNestedValue(device, 'InternetGatewayDevice.ManagementServer.ConnectionRequestURL'),
            uptime: formatUptime(getNestedValue(device, 'InternetGatewayDevice.DeviceInfo.UpTime')),
            serialNumber: getNestedValue(device, 'InternetGatewayDevice.DeviceInfo.SerialNumber') || device._id,
            lastInform: new Date(device._lastInform || Date.now()).toLocaleString(),
            customerNumber: req.session.username // Using the username as customer number
        };

        res.render('dashboard', { 
            deviceData,
            error: null
        });

    } catch (error) {
        console.error('Dashboard error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        res.render('dashboard', { 
            error: 'Gagal mengambil data perangkat',
            deviceData: {
                status: 'Disconnected',
                ponMode: 'N/A',
                pppUsername: 'N/A',
                ssid: 'N/A',
                password: 'N/A',
                userConnected: '0',
                rxPower: 'N/A',
                pppIP: 'N/A',
                productClass: 'N/A',
                temp: 'N/A',
                tr069IP: 'N/A',
                uptime: 'N/A',
                serialNumber: 'N/A',
                lastInform: 'N/A',
                tags: []
            }
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

        // Encode device ID dengan benar
        const encodedDeviceId = deviceId.replace(/-S-/, '%2DS-');
        console.log('Original device ID:', deviceId);
        console.log('Encoded device ID:', encodedDeviceId);

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
            parameterValues.push(
                // Password paths sesuai dengan virtual parameter
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", password, "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", password, "xsd:string"],
                ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", password, "xsd:string"],
                // Tambahan path untuk memastikan password terupdate
                ["Device.WiFi.AccessPoint.1.Security.KeyPassphrase", password, "xsd:string"],
                ["Device.WiFi.AccessPoint.1.Security.PreSharedKey", password, "xsd:string"]
            );

            // Tambah task untuk refresh setelah update password
            const refreshTask = {
                name: "refreshObject",
                objectName: "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1"
            };

            // Kirim task refresh
            await axios.post(
                `${process.env.GENIEACS_URL}/devices/${encodeURIComponent(actualDeviceId)}/tasks`,
                refreshTask,
                {
                    auth: {
                        username: process.env.GENIEACS_USERNAME,
                        password: process.env.GENIEACS_PASSWORD
                    }
                }
            );
        }

        if (parameterValues.length > 0) {
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
            await new Promise(resolve => setTimeout(resolve, 3000));
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});