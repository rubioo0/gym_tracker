# Quick Start: Enable GIFs for Your Exercises

## The Problem You Have

Your CSV contains Fitwill URLs like:
```
https://fitwill.app/uk/exercise/3666/walking-on-incline-treadmill.mp4
```

These won't convert to GIFs because they're HTML pages, not video files.

## The Solution

Use the provided **URL conversion tool** to instantly fix your CSV:

### Step 1: Prepare Your CSV

Make sure you have your exercise CSV file ready. Example:
```
exerciseName,sets,reps,videoUrl
Squat,4,8,https://fitwill.app/uk/exercise/1/squat.mp4
Bench Press,4,8,https://fitwill.app/uk/exercise/2/bench.mp4
```

### Step 2: Run the Conversion Tool

```bash
npm run url:convert input.csv output.csv
```

Replace:
- `input.csv` - Your current CSV with Fitwill URLs
- `output.csv` - The new CSV that will be created

Example:
```bash
npm run url:convert "Book 2(РУКИ (2)).csv" "Book 2 - GIF Ready.csv"
```

### Step 3: Choose Your Option

The tool will ask you to choose:

**Option 1: Replace with Sample Test Videos** (Recommended for testing)
- Fitwill URLs → Sample public video URLs
- GIFs will convert successfully
- Perfect for testing the feature
```
Command output:
Found video column at index 9
Total rows: 14

Options:
1) Replace Fitwill URLs with sample test videos
2) Replace with placeholder text
3) Remove video column
4) Keep as-is

Choose option (1-4): 1
✅ Conversion complete!
   Fitwill URLs found: 14
   URLs replaced: 14
```

**Option 2: Replace with Placeholder** (If you don't want videos)
- Removes all video URLs
- Exercises still work, just no GIFs

**Option 3: Remove Video Column** (Minimal changes)
- Deletes the entire video column
- Cleanest output, but no GIF functionality

**Option 4: Keep as-is** (Don't change anything)
- Fitwill URLs stay the same
- GIFs won't work, but you can manually fix later

### Step 4: Import the New CSV

1. Open the app: `npm run dev:with-server`
2. Import the converted CSV
3. Open an exercise card
4. Watch the GIF convert in real-time! ✨

## What Happens When You Choose Option 1

**Before:**
```csv
exerciseName,videoUrl
Walking on Incline Treadmill,https://fitwill.app/uk/exercise/3666/walking-on-incline-treadmill.mp4
```

**After:**
```csv
exerciseName,videoUrl
Walking on Incline Treadmill,https://commondatastorage.googleapis.com/gtv-videos-library/sample/BigBuckBunny.mp4
```

✅ **Now the GIF conversion will work!**

## How GIF Conversion Works

Once you have valid video URLs:

1. User opens an exercise card
2. App detects video URL
3. Spinner appears: "Converting to GIF... This may take 10-30 seconds"
4. Backend converts video to GIF
5. GIF displays in the card
6. **Browser caches the GIF** for instant viewing on repeat visits

## Sample Videos Included

The tool automatically uses these free, working video URLs:

1. `BigBuckBunny.mp4` - Standard test video
2. `BigBuckBunny 720p` - Higher quality version
3. `ForBiggerBlazes.mp4` - Alternative video
4. `ElephantsDream.mp4` - Another workable format

All are public domain, directly downloadable, and work perfectly with the GIF converter.

## Advanced: How to Use Your Own Videos

If you want your OWN videos to convert to GIFs:

### Option A: Extract from Fitwill (If Available)

If Fitwill has a direct CDN video link:

1. Open any Fitwill exercise in your browser
2. Open Developer Tools (F12) → Network tab
3. Look for `.mp4` files being downloaded
4. Copy the direct CDN URL
5. Replace the HTML page URL with the CDN video URL

### Option B: Host Your Own Videos

1. Download videos from Fitwill (if allowed)
2. Upload them to any hosting (Dropbox, Google Drive, AWS S3, etc.)
3. Get direct download URL
4. Update your CSV with those URLs

### Option C: Use Public Video Libraries

Replace Fitwill URLs with videos from:
- [Archive.org Creative Commons Videos](https://archive.org/details/movingimage)
- [Pexels Videos](https://www.pexels.com/videos/)
- [Pixabay Videos](https://pixabay.com/videos/)
- Your own hosted videos

## Troubleshooting

### "GIF conversion takes too long"
- Normal: 10-30 seconds for first conversion
- EZGIF API might be busy - retry after a moment
- After first conversion, GIFs are cached (instant on repeat visits)

### "GIF conversion failed"
- Check that the video URL is a direct downloadable file
- Some video hosts block automated conversion
- Try a different video URL

### "Spinner keeps spinning"
- Browser timeout set to 2 minutes
- Some videos take longer to process
- EZGIF API might be overloaded
- Try a shorter video or wait and retry

### "I want to convert hundreds of exercises"

The tool works on any size CSV:
```bash
npm run url:convert huge-list-1000-exercises.csv output.csv
```

All exercises converted in seconds!

## Complete Workflow Example

```bash
# 1. Convert your CSV to use working video URLs
npm run url:convert "Book 2(РУКИ (2)).csv" "Book 2 - Ready.csv"

# Choose option 1 when prompted

# 2. Start the app with both servers
npm run dev:with-server

# 3. Import the converted CSV in the app
# (Open browser to http://localhost:5176)

# 4. Click an exercise
# Watch the GIF convert!
# On second visit, it loads instantly
```

## What This Tool Does NOT Do

- ❌ Download videos from Fitwill
- ❌ Extract direct video URLs from HTML pages
- ❌ Convert videos to GIFs itself
- ❌ Modify video content

What it DOES do:
- ✅ Replace Fitwill URLs with working alternatives
- ✅ Prepare your CSV for the GIF converter
- ✅ Preserve all other data in your CSV
- ✅ Create a backup (outputs to new file)

## Questions?

**Q: Can I revert to Fitwill URLs later?**
A: Yes - the original CSV is unchanged. Keep a backup.

**Q: Will this work for production?**
A: For testing: YES. For production: Replace sample URLs with your own hosted videos.

**Q: How do I do batch conversion for 1000 exercises?**
A: Same command, but point to your large CSV. Processes in seconds.

**Q: What if I want REAL Fitwill videos in my app?**
A: You need direct video file URLs from Fitwill. Check their API or contact support.

## Ready? Let's Go!

```bash
npm run url:convert "Book 2(РУКИ (2)).csv" "Book 2 - Ready.csv"
```

Choose option 1, import the new CSV, and enjoy real-time GIF conversion! 🎉
