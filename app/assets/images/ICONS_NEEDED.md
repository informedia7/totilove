# PWA Icons

## ✅ Icons Generated

The PWA icons have been automatically generated:

- ✅ `icon-192x192.png` - 192x192 pixels (Android home screen)
- ✅ `icon-512x512.png` - 512x512 pixels (Splash screens, high-res displays)

**Location:** `/app/assets/images/`

## Current Icons

The current icons are **placeholder icons** with:
- Gradient background (theme colors: #667eea → #764ba2)
- White "T" letter (for Totilove)
- Rounded corners

## Replacing Icons

If you want to replace these with your actual logo:

### Option 1: Use the Generator Script
```bash
node scripts/generate-pwa-icons.js
```
This will regenerate icons from SVG (if you modify the script to use your logo).

### Option 2: Use Online Tools
- [PWA Asset Generator](https://www.pwabuilder.com/imageGenerator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)
- Upload your logo and generate all required sizes
- Replace the files in `/app/assets/images/`

### Option 3: Manual Creation
1. Create square images (192x192 and 512x512 pixels)
2. Use PNG format
3. Use the app's theme colors (#667eea, #764ba2)
4. Ensure icons are clear and recognizable at small sizes
5. Save as `icon-192x192.png` and `icon-512x512.png` in `/app/assets/images/`

### Option 4: Use HTML Generator
1. Open `scripts/generate-icons-simple.html` in your browser
2. Click "Generate & Download Icons"
3. Place downloaded files in `app/assets/images/`

## Testing

Icons are now available! To test:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Reload the page
3. Check browser console - should see no icon errors
4. Test PWA installation:
   - **Desktop:** Look for install icon in address bar
   - **Mobile:** Look for "Add to Home Screen" prompt
5. Verify icons appear correctly when installed

## Status

✅ **Icons are created and ready!** PWA installation should now work properly.

