#!/usr/bin/env node
/**
 * Fitwill URL Converter
 * Converts Fitwill exercise page URLs to usable alternatives for GIF conversion
 * 
 * Usage:
 *   node convert-fitwill-urls.mjs input.csv output.csv
 * 
 * This script provides 3 options:
 * 1. Replace with sample video URLs (for testing)
 * 2. Replace with placeholder (no video/GIF)
 * 3. Remove video column entirely
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function main() {
  const inputFile = process.argv[2]
  const outputFile = process.argv[3]

  if (!inputFile || !outputFile) {
    console.log('Usage: node convert-fitwill-urls.mjs <input.csv> <output.csv>')
    console.log('')
    console.log('Example: node convert-fitwill-urls.mjs Book.csv Book-converted.csv')
    process.exit(1)
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`)
    process.exit(1)
  }

  const csvContent = fs.readFileSync(inputFile, 'utf-8')
  const lines = csvContent.split('\n')

  if (lines.length < 2) {
    console.error('Error: CSV file appears to be empty or invalid')
    process.exit(1)
  }

  const headers = lines[0].split(',')
  const videoColIndex = headers.findIndex((h) => h.toLowerCase().includes('video') || h.toLowerCase().includes('url'))

  if (videoColIndex === -1) {
    console.log('No video/URL column found in CSV. Columns:')
    headers.forEach((h, i) => console.log(`  ${i}: ${h}`))
    process.exit(0)
  }

  console.log(`\nFound video column at index ${videoColIndex}: "${headers[videoColIndex]}"`)
  console.log(`Total rows: ${lines.length - 1}`)
  console.log('')
  console.log('Options:')
  console.log('1) Replace Fitwill URLs with sample test videos (for testing GIF conversion)')
  console.log('2) Replace with placeholder text (no video/GIF)')
  console.log('3) Remove video column entirely')
  console.log('4) Keep as-is (Fitwill URLs will not convert to GIF)')
  console.log('')

  const choice = await question('Choose option (1-4): ')

  let convertedLines = [lines[0]]
  let fitwillCount = 0
  let replacedCount = 0

  const sampleVideos = [
    'https://commondatastorage.googleapis.com/gtv-videos-library/sample/BigBuckBunny.mp4',
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-library/sample/ForBiggerBlazes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-library/sample/ElephantsDream.mp4',
  ]

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue

    let cells = lines[i].split(',')
    const currentUrl = cells[videoColIndex]

    if (currentUrl && currentUrl.includes('fitwill')) {
      fitwillCount++

      if (choice === '1') {
        const videoUrl = sampleVideos[replacedCount % sampleVideos.length]
        cells[videoColIndex] = videoUrl
        replacedCount++
      } else if (choice === '2') {
        cells[videoColIndex] = '[no video]'
        replacedCount++
      } else if (choice === '3') {
        cells.splice(videoColIndex, 1)
        replacedCount++
      }
    }

    convertedLines.push(cells.join(','))
  }

  // Handle column removal for all rows
  if (choice === '3') {
    convertedLines = convertedLines.map((line) => {
      const cells = line.split(',')
      cells.splice(videoColIndex, 1)
      return cells.join(',')
    })
    const newHeaders = headers.concat()
    newHeaders.splice(videoColIndex, 1)
    convertedLines[0] = newHeaders.join(',')
  }

  fs.writeFileSync(outputFile, convertedLines.join('\n'), 'utf-8')

  console.log('')
  console.log(`✅ Conversion complete!`)
  console.log(`   Fitwill URLs found: ${fitwillCount}`)
  console.log(`   URLs replaced: ${replacedCount}`)
  console.log(`   Output file: ${outputFile}`)
  console.log('')

  if (choice === '1') {
    console.log('Next steps:')
    console.log('1. Import the converted CSV into the app')
    console.log('2. Open an exercise card')
    console.log('3. Watch the GIF convert in real-time (10-30 seconds)')
    console.log('4. GIFs will be cached for instant viewing on repeat visits')
  } else if (choice === '4') {
    console.log('Note: Fitwill URLs cannot be converted to GIFs.')
    console.log('To enable GIF conversion, you need direct video file URLs.')
    console.log('')
    console.log('Options:')
    console.log('• Extract direct URLs from Fitwill (if available in their CDN)')
    console.log('• Use alternative video sources with direct download URLs')
    console.log('• Manual download videos and host them yourself')
  }

  rl.close()
}

main().catch((error) => {
  console.error('Error:', error.message)
  rl.close()
  process.exit(1)
})
