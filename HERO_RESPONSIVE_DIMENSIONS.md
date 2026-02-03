# Hero Image - Responsive Dimensions Guide

## Current Setup
- **Desktop**: Full viewport height (100vh, min 600px)
- **Tablet (≤768px)**: Min height 500px
- **Mobile (≤480px)**: Min height 450px
- **Background**: `background-size: cover` (fills entire area)

## Recommended Dimensions by Screen Size

### Desktop (1920px and above)
**Optimal Dimensions: 1920 x 1080 pixels (16:9)**
- Standard Full HD resolution
- Works perfectly for desktop displays
- File size: 200-500 KB (optimized JPEG/WebP)

**High-DPI Option: 2560 x 1440 pixels (16:9)**
- For Retina/4K displays
- File size: 400-800 KB (optimized)

### Tablet Landscape (768px - 1024px)
**Optimal Dimensions: 1536 x 864 pixels (16:9)**
- 1.5x scale for tablet displays
- Maintains quality on larger tablets
- File size: 150-400 KB

**Alternative: 1024 x 768 pixels (4:3)**
- If you prefer portrait orientation focus
- File size: 150-350 KB

### Tablet Portrait (480px - 768px)
**Optimal Dimensions: 1024 x 1366 pixels (3:4)**
- Matches iPad portrait resolution
- Better for vertical compositions
- File size: 150-400 KB

### Mobile Landscape (480px - 768px)
**Optimal Dimensions: 1080 x 608 pixels (16:9)**
- Standard mobile landscape
- File size: 100-300 KB

### Mobile Portrait (320px - 480px)
**Optimal Dimensions: 1080 x 1920 pixels (9:16)**
- Standard mobile portrait (Full HD phone)
- Vertical composition works best
- File size: 150-400 KB

## Implementation Strategy

### Option 1: Single Optimized Image (Current - Simplest)
**Use: 1920 x 1080 pixels**
- One image for all devices
- CSS `background-size: cover` handles scaling
- **Pros**: Simple, one file to manage
- **Cons**: May not be optimal for all screen sizes
- **File size target**: 300-500 KB (optimized)

### Option 2: Responsive Images with CSS Media Queries (Recommended)
Serve different images for different screen sizes:

```css
/* Mobile Portrait (default) */
.hero::before {
    background-image: url('/assets/hero/hero-mobile-portrait.jpg');
}

/* Mobile Landscape */
@media (min-width: 480px) and (orientation: landscape) {
    .hero::before {
        background-image: url('/assets/hero/hero-mobile-landscape.jpg');
    }
}

/* Tablet */
@media (min-width: 768px) {
    .hero::before {
        background-image: url('/assets/hero/hero-tablet.jpg');
    }
}

/* Desktop */
@media (min-width: 1024px) {
    .hero::before {
        background-image: url('/assets/hero/hero-desktop.jpg');
    }
}

/* Large Desktop / High-DPI */
@media (min-width: 1920px) {
    .hero::before {
        background-image: url('/assets/hero/hero-desktop-hd.jpg');
    }
}
```

### Option 3: Picture Element with srcset (Most Advanced)
Use HTML `<picture>` element for better browser optimization:

```html
<picture class="hero-background">
    <source media="(min-width: 1920px)" srcset="/assets/hero/hero-desktop-hd.jpg">
    <source media="(min-width: 1024px)" srcset="/assets/hero/hero-desktop.jpg">
    <source media="(min-width: 768px)" srcset="/assets/hero/hero-tablet.jpg">
    <source media="(min-width: 480px)" srcset="/assets/hero/hero-mobile-landscape.jpg">
    <img src="/assets/hero/hero-mobile-portrait.jpg" alt="Hero background">
</picture>
```

## Quick Reference Table

| Screen Size | Width Range | Recommended Dimensions | Aspect Ratio | File Size Target |
|------------|-------------|----------------------|--------------|------------------|
| Mobile Portrait | 320-480px | 1080 x 1920px | 9:16 | 150-400 KB |
| Mobile Landscape | 480-768px | 1080 x 608px | 16:9 | 100-300 KB |
| Tablet Portrait | 768-1024px | 1024 x 1366px | 3:4 | 150-400 KB |
| Tablet Landscape | 768-1024px | 1536 x 864px | 16:9 | 150-400 KB |
| Desktop | 1024-1920px | 1920 x 1080px | 16:9 | 200-500 KB |
| Large Desktop | 1920px+ | 2560 x 1440px | 16:9 | 400-800 KB |

## For Your Current Image

Since your current hero image (`Gemini_Generated_Image_jkch4pjkch4pjkch.png`) is optimized for desktop:

### Recommended Approach:
1. **Keep desktop version**: 1920 x 1080px (or current dimensions if already good)
2. **Create mobile-optimized version**: 
   - Crop/reframe to focus on center content
   - Dimensions: 1080 x 1920px (portrait) or 1080 x 608px (landscape)
   - Ensure important elements (players, table, fezzes) are centered

### Image Composition Tips:
- **Desktop**: Full scene with all elements visible
- **Mobile Portrait**: Focus on center - players and table (crop sides)
- **Mobile Landscape**: Focus on horizontal center - players and table (crop top/bottom)
- **Tablet**: Similar to desktop but can be slightly cropped

## File Format Recommendations

### Best Format by Use Case:
- **JPEG**: Best for photos, smallest file size (use 80-85% quality)
- **WebP**: Better compression than JPEG (use if browser support is good)
- **PNG**: Only if you need transparency (much larger files)

### Current Image:
- **Format**: PNG (14 MB - too large!)
- **Action**: Convert to JPEG or WebP, compress to 300-500 KB

## Optimization Tools

### Online:
- **Squoosh.app** (Google) - Best for testing different formats
- **TinyPNG.com** - PNG/JPEG compression
- **Compressor.io** - Multiple formats

### Desktop:
- **ImageOptim** (Mac)
- **FileOptimizer** (Windows)
- **GIMP** (Free, all platforms)

## Implementation Priority

### Phase 1 (Quick Win):
1. Optimize current desktop image to 1920x1080px, JPEG, <500KB
2. Use single image with `background-size: cover`

### Phase 2 (Better Performance):
1. Create mobile-optimized version (1080x1920px portrait)
2. Implement CSS media queries for responsive images

### Phase 3 (Optimal):
1. Create all size variants
2. Implement picture element with srcset
3. Add lazy loading for better performance

## Testing Checklist

- [ ] Image loads quickly (<2s on 3G)
- [ ] Looks good on mobile portrait (320-480px)
- [ ] Looks good on mobile landscape (480-768px)
- [ ] Looks good on tablet (768-1024px)
- [ ] Looks good on desktop (1920px+)
- [ ] Important content (center) visible on all sizes
- [ ] No pixelation on high-DPI displays
- [ ] File size under 500KB per image

