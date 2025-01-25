// Toast notification function
function showToast(message, type = 'success') {
    console.log(`Showing ${type} toast:`, message);
    
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast ${type} show`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove after delay
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Auto refresh data setiap 30 detik
function autoRefreshData() {
    console.log('Setting up auto refresh');
    setInterval(() => {
        const infoElement = document.getElementById('info');
        if (infoElement && infoElement.classList.contains('show')) {
            console.log('Auto refreshing data...');
            location.reload();
        }
    }, 30000);
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) {
        console.error('Password input not found:', inputId);
        return;
    }

    const icon = input.nextElementSibling.querySelector('i');
    console.log('Toggling password visibility');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Handle SSID form submission
async function handleSsidFormSubmit(e) {
    e.preventDefault();
    console.log('SSID form submitted');
    
    const form = e.target;
    const ssid = form.querySelector('#ssid').value;
    
    // Validasi SSID
    if (ssid.length < 1 || ssid.length > 32) {
        showToast('SSID harus antara 1-32 karakter', 'error');
        return;
    }
    
    console.log('Form data:', { ssid });
    
    try {
        const response = await fetch('/update-wifi/ssid', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ssid })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Server response:', result);
        
        if (result.success) {
            showToast('SSID berhasil diupdate', 'success');
            setTimeout(() => {
                console.log('Reloading page to refresh data...');
                location.reload();
            }, 2000);
        } else {
            console.error('Failed to update SSID:', result.error);
            showToast(result.error || 'Gagal mengupdate SSID', 'error');
        }
    } catch (error) {
        console.error('Error updating SSID:', error);
        showToast('Terjadi kesalahan saat mengupdate SSID', 'error');
    }
}

// Handle Password form submission
async function handlePasswordFormSubmit(e) {
    e.preventDefault();
    
    if (!confirm('Mengubah password akan merestart device. Lanjutkan?')) {
        return;
    }
    
    console.log('Password form submitted');
    
    const form = e.target;
    const password = form.querySelector('#password').value;
    
    if (password.length < 8) {
        showToast('Password harus minimal 8 karakter', 'error');
        return;
    }
    
    console.log('Form data:', { password: '********' });
    
    try {
        const response = await fetch('/update-wifi/password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Server response:', result);
        
        if (result.success) {
            showToast('Password WiFi berhasil diupdate. Device akan direstart.', 'success');
            form.querySelector('#password').value = '';
            setTimeout(() => {
                console.log('Reloading page to refresh data...');
                location.reload();
            }, 2000);
        } else {
            console.error('Failed to update password:', result.error);
            showToast(result.error || 'Gagal mengupdate password', 'error');
        }
    } catch (error) {
        console.error('Error updating password:', error);
        showToast('Terjadi kesalahan saat mengupdate password', 'error');
    }
}

// Handle WiFi form submission
async function handleWifiFormSubmit(e) {
    e.preventDefault();
    console.log('Form submitted');
    
    const form = e.target;
    const ssid = form.querySelector('#ssid').value;
    const password = form.querySelector('#password').value;
    
    console.log('Form data:', {
        ssid: ssid,
        password: password ? '********' : 'unchanged'
    });
    
    try {
        const response = await fetch('/update-wifi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ssid, password })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Server response:', result);
        
        if (result.success) {
            showToast('Pengaturan WiFi berhasil diupdate', 'success');
            // Clear password field
            form.querySelector('#password').value = '';
            // Reload after 2 seconds
            setTimeout(() => {
                console.log('Reloading page to refresh data...');
                location.reload();
            }, 2000);
        } else {
            console.error('Failed to update WiFi:', result.error);
            showToast(result.error || 'Gagal mengupdate pengaturan WiFi', 'error');
        }
    } catch (error) {
        console.error('Error updating WiFi settings:', error);
        showToast('Terjadi kesalahan saat mengupdate pengaturan WiFi', 'error');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');

    // Initialize SSID form handler
    const ssidForm = document.getElementById('ssidForm');
    console.log('SSID form found:', !!ssidForm);
    if (ssidForm) {
        ssidForm.addEventListener('submit', handleSsidFormSubmit);
    }

    // Initialize Password form handler
    const passwordForm = document.getElementById('passwordForm');
    console.log('Password form found:', !!passwordForm);
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordFormSubmit);
    }

    // Initialize WiFi form handler
    const wifiForm = document.getElementById('wifiSettingsForm');
    console.log('WiFi form found:', !!wifiForm);

    if (wifiForm) {
        wifiForm.addEventListener('submit', handleWifiFormSubmit);
    }

    // Initialize tag assignment form handler
    const assignTagForm = document.getElementById('assignTagForm');
    if (assignTagForm) {
        assignTagForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                deviceId: document.getElementById('deviceId').value,
                tag: document.getElementById('tag').value
            };

            try {
                const response = await fetch('/assign-tag', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });

                const data = await response.json();

                if (response.ok) {
                    showToast('Tag assigned successfully', 'success');
                    // Clear form
                    this.reset();
                    // Reload page to show updated tags
                    setTimeout(() => location.reload(), 1500);
                } else {
                    showToast(data.error || 'Failed to assign tag', 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showToast('An error occurred while assigning tag', 'error');
            }
        });
    }

    // Start auto refresh
    autoRefreshData();
});

function setLoading(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    const spinner = button.querySelector('.spinner-border');
    const icon = button.querySelector('.fas');
    
    button.disabled = isLoading;
    spinner.classList.toggle('d-none', !isLoading);
    icon.classList.toggle('d-none', isLoading);
}