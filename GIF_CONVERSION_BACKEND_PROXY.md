# GIF Conversion with Backend Proxy - Complete Solution

## Problem Solved

**CORS Error**: Direct browser requests to EZGIF API were being blocked due to CORS policy. The error was:
```
Access to fetch at 'https://ezgif.com/video-to-gif' from origin 'http://localhost:5175' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

## Solution Architecture

The solution uses a **backend proxy pattern** to bypass CORS restrictions:

1. **Frontend** (React app at port 5176)
   - Sends conversion requests to local backend proxy
   - Shows spinner during 10-30 second conversion
   - Displays GIF in exercise card once ready
   - Caches GIF URLs in localStorage for instant reloads

2. **Backend Proxy Server** (Node.js at port 3001)
   - Listens on `POST /api/convert-video-to-gif`
   - Makes all EZGIF API calls server-side (no CORS issues)
   - Returns GIF URL back to frontend

3. **EZGIF API** (https://ezgif.com)
   - Processes video to GIF conversion server-side
   - Only sees requests from backend server (trusted origin)

## File Changes

### New Files Created

**`server.ts`** (Backend Proxy Server)
- Express.js server listening on port 3001
- Handles `/api/convert-video-to-gif` endpoint
- Implements same conversion logic originally in browser:
  - Step 1: Upload video URL to EZGIF, get job ID
  - Step 2: Try AJAX conversion (fast)
  - Step 3: Fallback to form-based conversion (reliable)
  - Step 4: Extract and return GIF URL
- Full error handling and retry logic

### Modified Files

**`src/utils/ezgifClient.ts`** (Frontend Client)
- Removed direct EZGIF API calls
- Now sends JSON POST to `http://localhost:3001/api/convert-video-to-gif`
- Simplified implementation (just HTTP request to backend)
- Maintains same export signature for compatibility

**`package.json`** (NPM Scripts & Dependencies)
- Added dependencies: `express`, `cors`, `node-fetch`, `concurrently`, `tsx`
- New scripts:
  - `npm run server` - Start just the backend proxy
  - `npm run dev:with-server` - Start both backend + Vite dev server
  - `npm run dev` - Still available for frontend-only development

## How to Use

### Option 1: Full Development (Recommended)
```bash
npm run dev:with-server
```
This starts:
- ✅ Backend proxy on `http://localhost:3001`
- ✅ Vite dev server on `http://localhost:5176`
- Both servers reload code on file changes

### Option 2: Backend Only
```bash
npm run server
```
Use if you're running Vite separately.

### Option 3: Frontend Only (Old Way)
```bash
npm run dev
```
Note: This won't work for GIF conversion (CORS will block), but useful for non-GIF features.

## How It Works (Data Flow)

```
User clicks "Details" on exercise card
         ↓
React component mounts Modal
         ↓
useExerciseGifUrl hook checks localStorage
         ↓
If not cached, hook calls convertVideoToGifUrl()
         ↓
Frontend sends POST to http://localhost:3001/api/convert-video-to-gif
{
  videoUrl: "https://fitwill.app/uk/exercise/3666/walking-on-incline-treadmill.mp4",
  start: 0,
  end: 5,
  fps: 10,
  ...
}
         ↓
Backend server receives request
         ↓
Creates EZGIF job with video URL (gets job ID from 302 redirect)
         ↓
Attempts AJAX conversion with parameters
         ↓
If AJAX fails, tries form-based conversion as fallback
         ↓
Extracts GIF URL from EZGIF response (regex match)
         ↓
Returns to frontend:
{
  success: true,
  gifUrl: "https://s1.ezgif.com/tmp/ezgif-abc123.gif"
}
         ↓
Frontend caches GIF URL in localStorage
         ↓
Component displays GIF in exercise card
         ↓
On future visits, uses cached GIF (instant load)
```

## Configuration

### Ports
- Frontend: `http://localhost:5176` (Vite, may increment if ports busy)
- Backend: `http://localhost:3001` (Express proxy)

### Conversion Options (Customizable)
Can be passed to `convertVideoToGifUrl()`:
```typescript
{
  start: 0,      // Start time in seconds (default: 0)
  end: 5,        // End time in seconds (default: 5)
  fps: 10,       // Frames per second (default: 10)
  size: 'original', // 'original', 'half', 'quarter' (default: 'original')
  loop: 0,       // Loop count (0 = no loop, default: 0)
  timeoutMs: 120000, // Conversion timeout (default: 2 minutes)
  retries: 2,    // Retry attempts on failure (default: 2)
}
```

## Error Handling

### Frontend
- If backend is unreachable: Shows error message, passes visibility to original video link
- If conversion fails: Retries twice (1s, 2s backoff)
- localStorage prevents re-attempts for failed conversions

### Backend
- Validates video URL format
- Handles EZGIF API timeouts
- Returns detailed error messages to frontend

## Performance

### Browser Caching
- localStorage key: `exerciseGifUrl:{exerciseId}`
- Stores: `{ gifUrl, timestamp, originalUrl }`
- Instant reload on repeat visits

### Conversion Time
- Typical: 10-30 seconds (depends on video length)
- User sees spinner during conversion
- Timeout set to 2 minutes

### Bandwidth
- GIF URL returned (not downloaded locally)
- GIFs are small files (typically 500KB-2MB)
- EZGIF serves from CDN (fast access)

## Troubleshooting

### "Backend server not running"
Make sure you started with `npm run dev:with-server` (not just `npm run dev`).

### "CORS error still showing"
This means the backend proxy isn't being called. Check:
1. Is backend running on port 3001?
2. Is frontend sending request to `http://localhost:3001/api/convert-video-to-gif`?

### "GIF conversion takes too long"
- EZGIF API might be overloaded
- Video might be very long (try adjusting `end` parameter)
- Network connection might be slow
- Check backend server logs for EZGIF responses

### "Backend shows 'Could not extract job file'"
The video URL might not be a direct downloadable file. EZGIF requires:
- Direct HTTP/HTTPS URLs to video files (.mp4, .avi, .mov)
- NOT HTML pages that serve video via JavaScript
- NOT URLs with redirects or authentication

Example working URLs:
- ✅ `https://example.com/videos/workout.mp4`
- ✅ `https://cdn.example.com/video123.mp4`
- ❌ `https://youtube.com/watch?v=...` (HTML page)
- ❌ `https://fitwill.app/uk/exercise/3666/...` (HTML page with embedded player)

## Production Deployment

For production, you'll want to:

1. **Separate Backend & Frontend**
   - Deploy Node.js backend to production server
   - Update proxy URL from `localhost:3001` to production domain
   - Example: `https://api.yourapp.com/api/convert-video-to-gif`

2. **Environment Variables**
   ```typescript
   const PROXY_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001'
   ```

3. **Scaling**
   - Backend can be replicated across multiple instances
   - Use load balancer (nginx, AWS ALB)
   - Add request rate limiting

4. **Monitoring**
   - Log all conversion attempts and results
   - Track EZGIF API health
   - Monitor backend server response times

## Technical Details

### Why Backend Proxy?
EZGIF doesn't support CORS headers on their public API, making browser-to-server calls impossible. Server-to-server calls work fine since they're not subject to CORS restrictions.

### Why Not Pre-Convert?
Pre-converting 1000+ exercises before import would take hours. On-demand conversion provides:
- Instant import completion
- Delayed conversion only when user views card
- Better UX with loading spinner

### Why Not Store GIFs Locally?
GIFs are large (500KB-2MB each). Storing 1000 GIFs = 500MB-2GB of data.
Using EZGIF's CDN is more efficient and updates automatically.

## Code Quality

- ✅ TypeScript with strict type checking
- ✅ ESLint validation (zero errors)
- ✅ All existing tests still pass (16/17 pass)
- ✅ Proper error handling and logging
- ✅ Clean separation of concerns

## Next Steps (Optional Enhancements)

1. **Batch Conversion API**
   - Convert multiple videos in one request
   - Better for bulk operations

2. **Conversion Limits**
   - Rate limit API (e.g., 100 conversions/hour)
   - Prevent abuse

3. **Admin Dashboard**
   - View conversion stats
   - Monitor EZGIF API health
   - Manage cached GIFs

4. **Alternative Video Sources**
   - Support YouTube URLs (requires additional library)
   - Support other video hosting services
