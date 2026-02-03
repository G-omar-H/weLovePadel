#!/bin/bash

# Image Optimization Script
# Converts PNG images to WebP format with optimal quality settings

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Image Optimization Script${NC}"
echo "================================"

# Check if cwebp is installed
if ! command -v cwebp &> /dev/null; then
    echo -e "${RED}Error: cwebp is not installed${NC}"
    echo "Install it with: sudo apt-get install webp"
    exit 1
fi

# Function to optimize image
optimize_image() {
    local input_file="$1"
    local quality="$2"
    local max_width="$3"
    
    # Get file directory and name
    local dir=$(dirname "$input_file")
    local filename=$(basename "$input_file")
    local name="${filename%.*}"
    local ext="${filename##*.}"
    
    # Skip if not PNG or JPG
    if [[ "$ext" != "png" && "$ext" != "jpg" && "$ext" != "jpeg" ]]; then
        return
    fi
    
    # Output WebP file
    local output_file="${dir}/${name}.webp"
    
    # Get original size
    local original_size=$(stat -f%z "$input_file" 2>/dev/null || stat -c%s "$input_file" 2>/dev/null)
    
    # Convert to WebP
    if [ -n "$max_width" ]; then
        # Resize and convert
        cwebp -q "$quality" -resize "$max_width" 0 "$input_file" -o "$output_file" 2>/dev/null || \
        cwebp -q "$quality" "$input_file" -o "$output_file"
    else
        cwebp -q "$quality" "$input_file" -o "$output_file"
    fi
    
    # Get new size
    local new_size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
    local reduction=$((100 - (new_size * 100 / original_size)))
    
    echo -e "${GREEN}✓${NC} $filename → ${name}.webp (${reduction}% reduction)"
}

# Optimize hero images (desktop)
echo -e "\n${YELLOW}Optimizing desktop hero images...${NC}"
for file in assets/hero/*.png; do
    if [ -f "$file" ]; then
        optimize_image "$file" 82 1920
    fi
done

# Optimize mobile hero images (portrait)
echo -e "\n${YELLOW}Optimizing mobile portrait hero images...${NC}"
for file in assets/hero/mobiles/portrait/*.png; do
    if [ -f "$file" ]; then
        optimize_image "$file" 82 768
    fi
done

# Optimize mobile hero images (landscape)
echo -e "\n${YELLOW}Optimizing mobile landscape hero images...${NC}"
for file in assets/hero/mobiles/landscape/*.png assets/hero/mobiles/landscape/*.jpg; do
    if [ -f "$file" ]; then
        optimize_image "$file" 82 1024
    fi
done

# Optimize collection images
echo -e "\n${YELLOW}Optimizing collection images...${NC}"
for file in assets/collections/**/*.png; do
    if [ -f "$file" ]; then
        optimize_image "$file" 88
    fi
done

# Optimize icons (high quality)
echo -e "\n${YELLOW}Optimizing icons...${NC}"
for file in assets/icons/*.png; do
    if [ -f "$file" ]; then
        optimize_image "$file" 92
    fi
done

echo -e "\n${GREEN}Optimization complete!${NC}"
echo -e "${YELLOW}Note: Original files are preserved. Review WebP files and update HTML/CSS to use them.${NC}"

