#!/bin/bash

# Update sistem
echo "Updating system..."
sudo apt update
sudo apt upgrade -y

# Install Node.js dan npm
echo "Installing Node.js and npm..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install build-essential
sudo apt install -y build-essential

# Verifikasi instalasi
echo "Node.js version:"
node --version
echo "npm version:"
npm --version

# Hapus node_modules jika ada
rm -rf node_modules package-lock.json

# Bersihkan cache npm
npm cache clean --force

# Install dependensi yang diperlukan
echo "Installing project dependencies..."
npm install express@4.18.2
npm install express-session@1.17.3
npm install ejs@3.1.9
npm install axios@1.6.2
npm install dotenv@16.3.1

# Buat direktori views jika belum ada
mkdir -p views

# Set permission
chmod 755 app.js
chmod 755 views/login.ejs
chmod 755 views/dashboard.ejs

# Tampilkan pesan selesai
echo "Installation completed!"
echo "Now you can run: node app.js" 