#!/bin/bash

# Product Images Optimization Script
# Converts PNG/JPG product images to WebP format

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Product Images Optimization        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo -e "${RED}Error: ImageMagick is not installed${NC}"
    echo "Install it with: sudo apt-get install imagemagick"
    exit 1
fi

# Function to get file size in bytes
get_size() {
    local file="$1"
    if [ -f "$file" ]; then
        stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Function to format bytes
format_bytes() {
    local bytes=$1
    if [ "$bytes" -gt 1048576 ] 2>/dev/null; then
        echo "$(echo "scale=1; $bytes/1048576" | bc)MB"
    elif [ "$bytes" -gt 1024 ] 2>/dev/null; then
        echo "$(echo "scale=1; $bytes/1024" | bc)KB"
    else
        echo "${bytes}B"
    fi
}

# Function to optimize image
optimize_image() {
    local input_file="$1"
    local quality="$2"
    local max_width="$3"
    local max_height="$4"
    
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
    local original_size=$(get_size "$input_file")
    
    if [ "$original_size" -eq 0 ]; then
        return
    fi
    
    # Build convert command
    local convert_args=()
    
    # Add resize if specified
    if [ -n "$max_width" ] && [ -n "$max_height" ]; then
        convert_args+=(-resize "${max_width}x${max_height}>")
    elif [ -n "$max_width" ]; then
        convert_args+=(-resize "${max_width}x>")
    fi
    
    # Add quality and output
    convert_args+=(-quality "$quality" "$input_file" "$output_file")
    
    # Execute conversion
    convert "${convert_args[@]}" > /dev/null 2>&1 || return 1
    
    # Get new size
    local new_size=$(get_size "$output_file")
    
    if [ "$new_size" -gt 0 ]; then
        local reduction=$(echo "scale=1; (1 - $new_size / $original_size) * 100" | bc 2>/dev/null || echo "0")
        local orig_formatted=$(format_bytes $original_size)
        local new_formatted=$(format_bytes $new_size)
        
        echo -e "${GREEN}✓${NC} $filename"
        echo -e "  ${orig_formatted} → ${new_formatted} (${reduction}% reduction)"
        return 0
    fi
    return 1
}

# Track total savings
TOTAL_ORIGINAL=0
TOTAL_NEW=0

# Optimize all product images
echo -e "${YELLOW}🛍️  Optimizing product images...${NC}"
shopt -s nullglob
find products -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \) | while IFS= read -r file; do
    if [ -f "$file" ]; then
        original=$(get_size "$file")
        TOTAL_ORIGINAL=$((TOTAL_ORIGINAL + original))
        
        # Use 85% quality for product images (high quality needed)
        # Max dimensions: 1200px width for product detail pages
        if optimize_image "$file" 85 1200; then
            if [ -f "${file%.*}.webp" ]; then
                new=$(get_size "${file%.*}.webp")
                TOTAL_NEW=$((TOTAL_NEW + new))
            fi
        fi
    fi
done

# Calculate total savings
if [ $TOTAL_NEW -gt 0 ]; then
    TOTAL_REDUCTION=$(echo "scale=1; (1 - $TOTAL_NEW / $TOTAL_ORIGINAL) * 100" | bc 2>/dev/null || echo "0")
    ORIG_FORMATTED=$(format_bytes $TOTAL_ORIGINAL)
    NEW_FORMATTED=$(format_bytes $TOTAL_NEW)
    
    echo -e "\n${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   Optimization Summary                 ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo -e "Original: ${ORIG_FORMATTED}"
    echo -e "Optimized: ${NEW_FORMATTED}"
    echo -e "Savings: ${TOTAL_REDUCTION}%"
    echo ""
fi

echo -e "${YELLOW}⚠️  Note: Original files are preserved.${NC}"
echo -e "${YELLOW}   Update cart.js and HTML files to use WebP with fallbacks.${NC}"

