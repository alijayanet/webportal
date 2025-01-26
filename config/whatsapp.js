const axios = require('axios');

class WhatsAppService {
    constructor() {
        this.apiKey = process.env.MPWA_API_KEY;
        this.baseUrl = process.env.MPWA_BASE_URL;
        this.sender = process.env.MPWA_SENDER;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 detik
    }

    async sendMessage(phone, message, retryCount = 0) {
        try {
            console.log('\n=== SENDING WHATSAPP MESSAGE ===');
            console.log('To:', phone);
            console.log('Message:', message);
            console.log('Retry count:', retryCount);

            // Format nomor
            let formattedPhone = phone.replace(/\D/g, '');
            if (!formattedPhone.startsWith('62')) {
                formattedPhone = '62' + formattedPhone.substring(1);
            }

            const data = {
                api_key: this.apiKey,
                sender: this.sender,
                number: formattedPhone,
                message: message
            };

            console.log('Request URL:', this.baseUrl);
            console.log('Request data:', {
                ...data,
                api_key: '***'
            });

            const response = await axios({
                method: 'post',
                url: this.baseUrl,
                data: data,
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 detik timeout
            });

            console.log('Response:', response.data);
            console.log('=== END SENDING MESSAGE ===\n');

            return response.data;

        } catch (error) {
            console.error('WhatsApp send error:', {
                message: error.message,
                config: {
                    url: error.config?.url,
                    method: error.config?.method
                },
                response: {
                    status: error.response?.status,
                    data: error.response?.data
                }
            });

            // Retry logic
            if (retryCount < this.maxRetries) {
                console.log(`Retrying... (${retryCount + 1}/${this.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.sendMessage(phone, message, retryCount + 1);
            }

            throw error;
        }
    }
}

module.exports = new WhatsAppService(); 