// Toast notification function
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Auto refresh data setiap 30 detik
function autoRefreshData() {
    setInterval(() => {
        if (document.getElementById('info').classList.contains('show')) {
            location.reload();
        }
    }, 30000);
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling.querySelector('i');
    
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

// Handle WiFi settings form submission for multiple devices
document.addEventListener('submit', async function(e) {
    if (!e.target.classList.contains('wifiSettingsForm')) return;
    
    e.preventDefault();
    const deviceId = e.target.dataset.deviceId;
    
    const formData = {
        deviceId: deviceId,
        ssid: document.getElementById(`ssid-${deviceId}`).value,
        password: document.getElementById(`password-${deviceId}`).value
    };

    try {
        const response = await fetch('/update-wifi-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            showToast('WiFi settings updated successfully', 'success');
            // Clear password field after successful update
            document.getElementById(`password-${deviceId}`).value = '';
        } else {
            showToast(data.error || 'Failed to update WiFi settings', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('An error occurred while updating WiFi settings', 'error');
    }
});

// Handle tag assignment form
document.getElementById('assignTagForm').addEventListener('submit', async function(e) {
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    autoRefreshData();
});

document.getElementById('wifiSettingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const ssid = document.getElementById('ssid').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/update-wifi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ssid, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Pengaturan WiFi berhasil diupdate');
            location.reload();
        } else {
            alert(result.error || 'Gagal mengupdate pengaturan WiFi');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Terjadi kesalahan saat mengupdate pengaturan WiFi');
    }
});