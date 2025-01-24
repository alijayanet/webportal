const axios = require('axios');
require('dotenv').config();

async function analyzeDevice(deviceId) {
    try {
        console.log(`\nAnalyzing device: ${deviceId}`);
        const encodedId = encodeURIComponent(deviceId);

        // Buat task untuk mendapatkan nilai parameter
        const task = {
            name: "getParameterValues",
            parameterNames: [
                "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username",
                "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
                "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.PONONU.OpticalSignalLevel",
                "VirtualParameters.pppUsername",
                "VirtualParameters.pppIP",
                "VirtualParameters.redaman"
            ]
        };

        // Kirim task
        console.log('Sending task...');
        const taskResponse = await axios.post(
            `${process.env.GENIEACS_URL}/devices/${encodedId}/tasks`,
            task,
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                auth: {
                    username: process.env.GENIEACS_USERNAME,
                    password: process.env.GENIEACS_PASSWORD
                }
            }
        );

        console.log('Task response:', JSON.stringify(taskResponse.data, null, 2));

        // Tunggu sebentar
        console.log('Waiting for task completion...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Ambil data device
        console.log('Getting device data...');
        const deviceDetail = await axios.get(`${process.env.GENIEACS_URL}/devices/${encodedId}`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        if (deviceDetail.data) {
            console.log('\nDevice data:', JSON.stringify(deviceDetail.data, null, 2));
            
            // Log parameter values
            if (deviceDetail.data.Parameters) {
                console.log('\nParameter values:');
                Object.entries(deviceDetail.data.Parameters).forEach(([key, value]) => {
                    console.log(`${key}: ${value._value}`);
                });
            }

            // Log virtual parameters
            if (deviceDetail.data.VirtualParameters) {
                console.log('\nVirtual Parameters:');
                Object.entries(deviceDetail.data.VirtualParameters).forEach(([key, value]) => {
                    console.log(`${key}: ${value._value}`);
                });
            }
        } else {
            console.log('No device data found');
        }
    } catch (error) {
        console.error('Analysis failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
            console.error('Full error:', error);
        }
    }
}

async function testConnection() {
    try {
        console.log('Testing GenieACS connection...');
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        console.log('\nFound devices:', response.data.length);

        if (response.data.length > 0) {
            // Analyze first device
            await analyzeDevice(response.data[0]._id);
        }
    } catch (error) {
        console.error('Connection Error Details:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
    }
}

async function testTags() {
    try {
        console.log('\nTesting Tags...');
        const response = await axios.get(`${process.env.GENIEACS_URL}/devices`, {
            auth: {
                username: process.env.GENIEACS_USERNAME,
                password: process.env.GENIEACS_PASSWORD
            }
        });

        console.log('Analyzing devices for Tags...');
        response.data.forEach((device, index) => {
            if (device.Tags) {
                console.log(`\nDevice ${index + 1} (${device._id}):`);
                console.log('Tags:', device.Tags);
            }
        });

    } catch (error) {
        console.error('Tags test failed:', error);
    }
}

testConnection().then(() => testTags()); 