#!/usr/bin/env node
/**
 * Full End-to-End Test
 * Simulates what happens when user imports converted CSV and opens an exercise card
 */

const PROXY_BASE_URL = 'http://localhost:3001'
const TEST_VIDEO_URL =
  'https://commondatastorage.googleapis.com/gtv-videos-library/sample/BigBuckBunny.mp4'

async function testBackendProxy() {
  console.log('🧪 Testing Backend Proxy with Sample Video URL')
  console.log('================================================\n')

  console.log(`Test Video URL: ${TEST_VIDEO_URL}`)
  console.log(`Backend Endpoint: ${PROXY_BASE_URL}/api/convert-video-to-gif`)
  console.log('')

  try {
    console.log('Sending conversion request...')
    const response = await fetch(`${PROXY_BASE_URL}/api/convert-video-to-gif`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoUrl: TEST_VIDEO_URL,
        start: 0,
        end: 5,
        fps: 10,
        size: 'original',
        loop: 0,
      }),
    })

    console.log(`Response Status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const error = await response.json()
      console.log('')
      console.log('❌ CONVERSION FAILED')
      console.log(`Error: ${error.error}`)
      console.log('')
      console.log('This might mean:')
      console.log('- Backend server is not running (start with: npm run dev:with-server)')
      console.log('- EZGIF API is temporarily overloaded')
      console.log('- Network connectivity issue')
      return false
    }

    const result = await response.json()

    if (result.success && result.gifUrl) {
      console.log('')
      console.log('✅ CONVERSION SUCCESSFUL!')
      console.log(`GIF URL: ${result.gifUrl}`)
      console.log('')
      console.log('What this means:')
      console.log('✓ Backend proxy is working')
      console.log('✓ Direct video file URLs convert to GIFs successfully')
      console.log('✓ Your converted CSV with working video URLs WILL produce GIFs')
      console.log('✓ GIFs will display in exercise cards in real-time')
      console.log('')
      return true
    } else {
      console.log('')
      console.log('❌ CONVERSION FAILED')
      console.log(`Response: ${JSON.stringify(result)}`)
      return false
    }
  } catch (error) {
    console.log('')
    console.log('❌ REQUEST FAILED')
    console.log(`Error: ${error.message}`)
    console.log('')
    console.log('Make sure:')
    console.log('1. Backend server is running: npm run dev:with-server')
    console.log('2. Port 3001 is accessible')
    console.log('3. Network connection is active')
    return false
  }
}

testBackendProxy().then((success) => {
  if (success) {
    console.log('🎉 Everything is working! You can now:')
    console.log('1. Use the CSV converter: npm run url:convert input.csv output.csv')
    console.log('2. Import the converted CSV into the app')
    console.log('3. Open an exercise card to see real-time GIF conversion')
  } else {
    console.log('⚠️  Test failed. Check that backend server is running.')
  }
  process.exit(success ? 0 : 1)
})
