#!/bin/bash

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== INSTALASI GENIEACS & WEBPORTAL ===${NC}\n"

# Fungsi untuk install NodeJS
install_nodejs() {
    echo -e "${YELLOW}Installing NodeJS & NPM...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    node --version
    npm --version
}

# Fungsi untuk install MongoDB
install_mongodb() {
    echo -e "${YELLOW}Installing MongoDB...${NC}"
    wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
    echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org
    sudo systemctl start mongod
    sudo systemctl enable mongod
}

# Fungsi untuk install GenieACS
install_genieacs() {
    echo -e "${YELLOW}Installing GenieACS...${NC}"
    sudo npm install -g genieacs
    
    # Buat service files
    echo -e "${YELLOW}Creating GenieACS services...${NC}"
    
    # genieacs-cwmp
    sudo tee /lib/systemd/system/genieacs-cwmp.service > /dev/null << EOL
[Unit]
Description=GenieACS CWMP
After=network.target

[Service]
User=genieacs
Environment=NODE_ENV=production
ExecStart=/usr/bin/genieacs-cwmp

[Install]
WantedBy=multi-user.target
EOL

    # genieacs-nbi
    sudo tee /lib/systemd/system/genieacs-nbi.service > /dev/null << EOL
[Unit]
Description=GenieACS NBI
After=network.target

[Service]
User=genieacs
Environment=NODE_ENV=production
ExecStart=/usr/bin/genieacs-nbi

[Install]
WantedBy=multi-user.target
EOL

    # genieacs-fs
    sudo tee /lib/systemd/system/genieacs-fs.service > /dev/null << EOL
[Unit]
Description=GenieACS FS
After=network.target

[Service]
User=genieacs
Environment=NODE_ENV=production
ExecStart=/usr/bin/genieacs-fs

[Install]
WantedBy=multi-user.target
EOL

    # genieacs-ui
    sudo tee /lib/systemd/system/genieacs-ui.service > /dev/null << EOL
[Unit]
Description=GenieACS UI
After=network.target

[Service]
User=genieacs
Environment=NODE_ENV=production
ExecStart=/usr/bin/genieacs-ui

[Install]
WantedBy=multi-user.target
EOL

    # Create genieacs user
    sudo useradd -r -m -s /bin/false genieacs

    # Start services
    sudo systemctl daemon-reload
    for service in cwmp nbi fs ui; do
        sudo systemctl enable genieacs-$service
        sudo systemctl start genieacs-$service
    done
}

# Fungsi untuk setup metadata
setup_metadata() {
    echo -e "${YELLOW}Setting up metadata...${NC}"
    
    # Create metadata folders
    mkdir -p /opt/genieacs/metadata/{config,scripts}
    
    # Copy metadata files
    if [ -d "./metadata" ]; then
        cp -r ./metadata/* /opt/genieacs/metadata/
    fi

    # Setup languages
    echo -e "${YELLOW}Setting up languages...${NC}"
    mkdir -p /opt/genieacs/config
    cp ./config/languages.js /opt/genieacs/config/

    # Set default language in .env
    if [ ! -f ".env" ]; then
        echo "WA_DEFAULT_LANG=id" >> .env
    fi

    # Set permissions
    chown -R genieacs:genieacs /opt/genieacs
    chmod -R 755 /opt/genieacs

    echo -e "${GREEN}Metadata setup completed!${NC}"
}

# Fungsi untuk install WebPortal
install_webportal() {
    echo -e "${YELLOW}Installing WebPortal...${NC}"
    
    # Install PM2
    sudo npm install -g pm2
    
    # Install dependencies
    npm install @adiwajshing/baileys@5.0.0 qrcode@1.5.0 qrcode-terminal@0.12.0
    
    # Setup konfigurasi
    node install.js
    
    # Create WhatsApp auth folder
    mkdir -p .whatsapp-auth
    chmod 755 .whatsapp-auth
    
    # Setup WhatsApp
    echo -e "${YELLOW}Setting up WhatsApp...${NC}"
    node setup-wa.js &
    WA_PID=$!
    
    # Start dengan PM2
    pm2 start app.js --name webportal
    pm2 save
    
    # Setup startup
    pm2 startup
    
    # Tunggu setup WhatsApp
    echo -e "${YELLOW}Menunggu setup WhatsApp...${NC}"
    wait $WA_PID
}

# Update main installation
main() {
    echo -e "${YELLOW}Starting installation...${NC}"
    
    # Check if metadata folder exists
    if [ ! -d "./metadata" ]; then
        echo -e "${RED}Metadata folder not found!${NC}"
        echo -e "Please create metadata folder with required files:"
        echo -e "- metadata/bson/"
        echo -e "- metadata/config/"
        echo -e "- metadata/scripts/"
        exit 1
    }
    
    # Install components
    install_nodejs
    install_mongodb
    install_genieacs
    setup_metadata
    install_webportal
    
    echo -e "${GREEN}Installation completed!${NC}"
    echo -e "${YELLOW}GenieACS UI: http://localhost:3000${NC}"
    echo -e "${YELLOW}WebPortal: http://localhost:3100${NC}"

    # Check services status
    echo -e "\n${YELLOW}Service Status:${NC}"
    systemctl status genieacs-cwmp | grep Active
    systemctl status genieacs-nbi | grep Active
    systemctl status genieacs-fs | grep Active
    systemctl status genieacs-ui | grep Active
    pm2 list

    echo -e "\n${GREEN}Setup complete! Please check the services status above.${NC}"
}

# Run main
main

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root${NC}"
    exit
fi

# Update system
echo -e "${YELLOW}Updating system...${NC}"
apt-get update && apt-get upgrade -y

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
apt-get install -y curl wget git

# Run main
main 