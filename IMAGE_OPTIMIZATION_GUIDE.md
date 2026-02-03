# Image Optimization Guide

## Current Situation
- Hero images: **66MB total** (some individual files are 14MB!)
- Collection images: 374KB (acceptable)
- Icons: 300KB total (acceptable)

## Recommended Optimization Strategy

### 1. **Convert PNG to WebP Format** (Best Option)
- **WebP** provides 25-35% better compression than PNG
- Maintains quality while significantly reducing file size
- Supported by all modern browsers (95%+ coverage)
- Fallback to PNG for older browsers

### 2. **Quality Settings**
- **Hero images**: 80-85% quality (good balance)
- **Collection images**: 85-90% quality (higher quality needed)
- **Icons**: 90-95% quality (small files, need sharpness)

### 3. **Image Dimensions**
- **Desktop hero**: Max 1920px width (current may be larger)
- **Mobile hero**: Max 768px width
- **Collection images**: 400x400px (already optimized)

### 4. **Tools for Optimization**

#### Option A: Using `cwebp` (Google WebP)
```bash
# Install on Ubuntu/Debian
sudo apt-get install webp

# Convert PNG to WebP (85% quality)
cwebp -q 85 input.png -o output.webp

# Batch convert
for file in assets/hero/*.png; do
    cwebp -q 85 "$file" -o "${file%.png}.webp"
done
```

#### Option B: Using ImageMagick
```bash
# Install
sudo apt-get install imagemagick

# Convert to WebP
convert input.png -quality 85 output.webp

# Resize and convert
convert input.png -resize 1920x -quality 85 output.webp
```

#### Option C: Online Tools (Manual)
- **Squoosh** (by Google): https://squoosh.app
- **TinyPNG**: https://tinypng.com
- **ImageOptim**: https://imageoptim.com

### 5. **Implementation Steps**

1. **Create optimized versions**:
   - Convert hero PNGs to WebP (80-85% quality)
   - Resize if needed (max 1920px width for desktop)
   - Keep originals as backup

2. **Update HTML/CSS**:
   - Use `<picture>` element with WebP and PNG fallback
   - Or use CSS with WebP and fallback

3. **Expected Results**:
   - Hero images: 14MB → ~500KB-1MB (90%+ reduction)
   - Total assets: 66MB → ~5-8MB (85%+ reduction)

### 6. **CSS Implementation Example**

```css
/* Use WebP with PNG fallback */
.hero::before {
    background-image: url('/assets/hero/image.webp');
}

/* Fallback for older browsers */
@supports not (background-image: url('image.webp')) {
    .hero::before {
        background-image: url('/assets/hero/image.png');
    }
}
```

### 7. **HTML Implementation Example**

```html
<picture>
    <source srcset="image.webp" type="image/webp">
    <img src="image.png" alt="Description">
</picture>
```

## Quick Optimization Script

See `optimize-images.sh` for automated optimization.

## Priority Order

1. **High Priority**: Hero images (66MB → ~5MB)
2. **Medium Priority**: Collection images (already good, but can improve)
3. **Low Priority**: Icons (already optimized)

## Expected Performance Improvements

- **Page load time**: 50-70% faster
- **Bandwidth usage**: 85-90% reduction
- **Mobile experience**: Significantly improved
- **SEO**: Better Core Web Vitals scores

