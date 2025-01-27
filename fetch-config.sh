#!/bin/bash

# Warna untuk output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Server source
SOURCE_SERVER="http://103.76.129.93:32323"

echo -e "${GREEN}=== FETCH GENIEACS CONFIG ===${NC}\n"

# Buat folder configs
echo -e "${YELLOW}Creating config folders...${NC}"
mkdir -p configs/{bson,config,scripts/{provisions,virtual_parameters}}

# Function untuk download dengan error handling
download_config() {
    local url="$1"
    local output="$2"
    local name="$3"

    echo -e "Downloading $name..."
    response=$(curl -s "$url")
    
    if [ $? -eq 0 ] && [ ! -z "$response" ]; then
        echo "$response" > "$output"
        echo -e "${GREEN}✓ Saved: $name${NC}"
    else
        echo -e "${RED}✗ Failed to download: $name${NC}"
        return 1
    fi
}

# Fetch collections
echo -e "\n${YELLOW}Fetching MongoDB collections...${NC}"
collections=("provisions" "virtual_parameters" "permissions" "users" "presets" "files" "tags")

for collection in "${collections[@]}"; do
    download_config "$SOURCE_SERVER/api/$collection" "configs/bson/$collection.bson" "$collection"
done

# Extract scripts from virtual parameters
echo -e "\n${YELLOW}Extracting virtual parameter scripts...${NC}"
cat configs/bson/virtual_parameters.bson | jq -c '.[]' | while read -r vp; do
    name=$(echo $vp | jq -r '._id' | sed 's/VirtualParameters\.//')
    script=$(echo $vp | jq -r '.script')
    echo "// Virtual Parameter: $name" > "configs/scripts/virtual_parameters/$name.js"
    echo "$script" >> "configs/scripts/virtual_parameters/$name.js"
    echo -e "${GREEN}✓ Extracted: $name${NC}"
done

# Extract provision scripts
echo -e "\n${YELLOW}Extracting provision scripts...${NC}"
cat configs/bson/provisions.bson | jq -c '.[]' | while read -r prov; do
    name=$(echo $prov | jq -r '._id')
    script=$(echo $prov | jq -r '.script')
    echo "// Provision: $name" > "configs/scripts/provisions/$name.js"
    echo "$script" >> "configs/scripts/provisions/$name.js"
    echo -e "${GREEN}✓ Extracted: $name${NC}"
done

# Fetch config files
echo -e "\n${YELLOW}Fetching config files...${NC}"
download_config "$SOURCE_SERVER/api/config" "configs/config/config.json" "main config"
download_config "$SOURCE_SERVER/api/ui/config" "configs/config/ui-config.json" "UI config"

# Create backup package
echo -e "\n${YELLOW}Creating backup package...${NC}"
tar -czf genieacs-config-$(date +%Y%m%d).tar.gz configs/

echo -e "\n${GREEN}Config fetch completed!${NC}"
echo -e "Backup package: genieacs-config-$(date +%Y%m%d).tar.gz"
echo -e "\nContents:"
echo -e "- BSON files: ${YELLOW}configs/bson/${NC}"
echo -e "- Config files: ${YELLOW}configs/config/${NC}"
echo -e "- Virtual Parameters: ${YELLOW}configs/scripts/virtual_parameters/${NC}"
echo -e "- Provisions: ${YELLOW}configs/scripts/provisions/${NC}"

# Verify files
echo -e "\n${YELLOW}Verifying downloaded files:${NC}"
for dir in configs/bson configs/config configs/scripts/virtual_parameters configs/scripts/provisions; do
    count=$(ls -1 $dir | wc -l)
    echo -e "Files in $dir: $count"
done 