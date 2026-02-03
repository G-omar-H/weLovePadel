# Mobile Hero Image - Optimal Dimensions Guide

## Problem
When using `background-size: contain`, images don't fill the hero section, leaving empty space. When using `background-size: cover`, images get cropped. We need optimal dimensions that work with `cover` while preserving important content.

## Current Hero Section Dimensions

### Mobile Portrait (< 480px)
- **Height**: `100vh` with `min-height: 450px`
- **Typical viewport**: 375px × 667px (iPhone SE) to 428px × 926px (iPhone 14 Pro Max)
- **Aspect Ratio**: ~9:16 (portrait)
- **Hero aspect ratio**: ~0.67:1 (width:height)

### Mobile Landscape (480px - 767px)
- **Height**: `100vh` with `min-height: 450px`
- **Typical viewport**: 667px × 375px to 926px × 428px
- **Aspect Ratio**: ~16:9 (landscape)
- **Hero aspect ratio**: ~1.78:1 (width:height)

### Tablet Portrait (768px - 1024px)
- **Height**: `min-height: 500px`
- **Typical viewport**: 768px × 1024px (iPad)
- **Aspect Ratio**: ~3:4 (portrait)
- **Hero aspect ratio**: ~0.75:1 (width:height)

## Recommended Image Dimensions

### Mobile Portrait Image
**Optimal: 1080 × 1920 pixels (9:16 aspect ratio)**
- Matches standard mobile portrait viewport
- Works perfectly with `background-size: cover`
- Important content should be centered vertically
- **Safe zone**: Keep important elements (players, table, fezzes) in center 60% of image height
- **File size target**: 200-400 KB (optimized JPEG/WebP)

**Alternative: 1080 × 1440 pixels (3:4 aspect ratio)**
- Slightly shorter, less vertical scrolling
- Still works well with `cover`
- Better for hero sections that aren't full viewport height

### Mobile Landscape Image
**Optimal: 1920 × 1080 pixels (16:9 aspect ratio)**
- Standard landscape format
- Works perfectly with `background-size: cover`
- Important content should be centered horizontally
- **Safe zone**: Keep important elements in center 70% of image width
- **File size target**: 200-400 KB (optimized JPEG/WebP)

**Alternative: 1440 × 810 pixels (16:9 aspect ratio)**
- Smaller file size
- Still good quality for mobile landscape

### Tablet Portrait Image
**Optimal: 1536 × 2048 pixels (3:4 aspect ratio)**
- Matches iPad portrait resolution (Retina)
- Works perfectly with `background-size: cover`
- Important content should be centered
- **File size target**: 300-500 KB (optimized JPEG/WebP)

## Composition Guidelines

### For Mobile Portrait (1080 × 1920px)
1. **Vertical Composition**
   - Place important elements (players, table) in the **center 60%** vertically
   - Top 20% and bottom 20% can be cropped without losing key content
   - Center important text/logos in the middle third

2. **Content Positioning**
   - Main subjects: Center vertically (40%-60% from top)
   - Table with fezzes: Center to lower-center (50%-70% from top)
   - Background elements: Can extend to edges

### For Mobile Landscape (1920 × 1080px)
1. **Horizontal Composition**
   - Place important elements in the **center 70%** horizontally
   - Left 15% and right 15% can be cropped
   - Center important content horizontally

2. **Content Positioning**
   - Main subjects: Center horizontally (35%-65% from left)
   - Table: Center horizontally
   - Background elements: Can extend to edges

### For Tablet Portrait (1536 × 2048px)
1. **Balanced Composition**
   - Place important elements in the **center 60%** both vertically and horizontally
   - Safe zone: 20% margin on all sides

## Implementation Strategy

### Option 1: Use `cover` with Optimal Dimensions (Recommended)
```css
.hero::before {
    background-size: cover;
    background-position: center center;
}
```
- Images fill entire hero section
- No empty space
- Requires images with correct aspect ratios
- Important content must be in safe zones

### Option 2: Adjust Hero Height to Match Image Aspect Ratio
```css
@media (max-width: 480px) {
    .hero {
        height: 100vh;
        min-height: 667px; /* Match common mobile height */
    }
}
```
- Hero height matches image aspect ratio
- Better fit with `cover`
- May require scrolling on some devices

### Option 3: Use `cover` with Smart Positioning
```css
.hero::before {
    background-size: cover;
    background-position: center 40%; /* Focus on important content */
}
```
- Adjusts positioning to show important content
- Still fills entire space
- May need different positioning per image

## Recommended Approach

**For your current setup, use:**
1. **Mobile Portrait**: 1080 × 1920px images
2. **Mobile Landscape**: 1920 × 1080px images
3. **Tablet Portrait**: 1536 × 2048px images
4. **Use `background-size: cover`** with `background-position: center center`
5. **Ensure important content is in the center 60-70% of each image**

## Quick Reference Table

| Screen Type | Viewport Range | Image Dimensions | Aspect Ratio | Safe Zone |
|------------|----------------|------------------|--------------|-----------|
| Mobile Portrait | < 480px | 1080 × 1920px | 9:16 | Center 60% vertical |
| Mobile Landscape | 480-767px | 1920 × 1080px | 16:9 | Center 70% horizontal |
| Tablet Portrait | 768-1024px | 1536 × 2048px | 3:4 | Center 60% both |

## Image Optimization

### File Format
- **JPEG**: Best for photos (80-85% quality)
- **WebP**: Better compression (if browser support is good)
- **PNG**: Only if transparency needed (much larger)

### Compression Targets
- Mobile Portrait (1080×1920): 200-400 KB
- Mobile Landscape (1920×1080): 200-400 KB
- Tablet Portrait (1536×2048): 300-500 KB

### Tools
- **Squoosh.app** - Google's compression tool
- **TinyPNG.com** - PNG/JPEG compression
- **ImageOptim** - Desktop tool

## Testing Checklist

- [ ] Image fills entire hero section (no empty space)
- [ ] Important content (players, table, fezzes) is visible
- [ ] No important content is cropped on edges
- [ ] Image loads quickly (< 2s on 3G)
- [ ] Looks good on various mobile devices
- [ ] File size is optimized (< 500 KB)

