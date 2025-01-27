#!/bin/bash

# Warna untuk output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== EXPORT METADATA GENIEACS ===${NC}\n"

# Buat folder metadata
echo -e "${YELLOW}Creating metadata folders...${NC}"
mkdir -p metadata/{bson,config,scripts/{provisions,virtual_parameters}}

# Export BSON files
echo -e "${YELLOW}Exporting BSON files...${NC}"
collections=("provisions" "virtual_parameters" "permissions" "users" "presets" "files" "tags")

for collection in "${collections[@]}"; do
    echo "Exporting $collection..."
    mongoexport --db genieacs --collection $collection --out metadata/bson/$collection.bson
done

# Export config files
echo -e "${YELLOW}Exporting config files...${NC}"
if [ -f "/opt/genieacs/config.json" ]; then
    cp /opt/genieacs/config.json metadata/config/
fi

# Export UI config jika ada
if [ -f "/opt/genieacs/ui-config.json" ]; then
    cp /opt/genieacs/ui-config.json metadata/config/
fi

# Export scripts
echo -e "${YELLOW}Exporting scripts...${NC}"
if [ -d "/opt/genieacs/metadata/scripts" ]; then
    cp -r /opt/genieacs/metadata/scripts/* metadata/scripts/
else
    # Export dari database jika tidak ada di filesystem
    echo "Exporting provisions scripts..."
    mongo genieacs --eval 'db.provisions.find().forEach(function(doc) {
        print("Writing " + doc._id);
        var content = "// Provision: " + doc._id + "\n" + doc.script;
        var filename = "metadata/scripts/provisions/" + doc._id + ".js";
        fs.writeFileSync(filename, content);
    })'

    echo "Exporting virtual parameters scripts..."
    mongo genieacs --eval 'db.virtual_parameters.find().forEach(function(doc) {
        print("Writing " + doc._id);
        var name = doc._id.replace("VirtualParameters.", "");
        var content = "// Virtual Parameter: " + doc._id + "\n" + doc.script;
        var filename = "metadata/scripts/virtual_parameters/" + name + ".js";
        fs.writeFileSync(filename, content);
    })'
fi

# Create metadata package
echo -e "${YELLOW}Creating metadata package...${NC}"
tar -czf genieacs-metadata.tar.gz metadata/

echo -e "${GREEN}Export completed!${NC}"
echo -e "Metadata package: genieacs-metadata.tar.gz"
echo -e "\nContents:"
echo -e "- BSON files: ${YELLOW}metadata/bson/${NC}"
echo -e "- Config files: ${YELLOW}metadata/config/${NC}"
echo -e "- Scripts: ${YELLOW}metadata/scripts/${NC}" 