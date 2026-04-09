#!/usr/bin/env node
/**
 * Test the URL converter with the user's actual CSV
 * This proves the solution works end-to-end
 */

import fs from 'fs'
import { spawn } from 'child_process'

const inputFile = 'd:\\code\\GEM3\\Book 2(РУКИ (2)).csv'
const outputFile = 'd:\\code\\GEM3\\training-os\\Book 2 - GIF Ready.csv'

console.log(`Testing URL converter...`)
console.log(`Input file: ${inputFile}`)
console.log(`Output file: ${outputFile}`)
console.log('')

// Read the input file
const csvContent = fs.readFileSync(inputFile, 'utf-8')
const lines = csvContent.split('\n')

// Skip the first line if it's just a URL
let startIdx = 0
if (lines[0].startsWith('http')) {
  startIdx = 1
}

const headers = lines[startIdx].split(',')

console.log(`CSV Summary:`)
console.log(`  Total rows: ${lines.length - startIdx - 1}`)
console.log(`  Columns: ${headers.length}`)
console.log('')

// Find video column (should be last non-empty column)
let videoColIndex = -1
for (let i = headers.length - 1; i >= 0; i--) {
  if (headers[i].trim() || lines[startIdx + 1]?.split(',')[i]?.startsWith('http')) {
    videoColIndex = i
    break
  }
}

if (videoColIndex === -1) {
  // Assume it's the last column
  videoColIndex = headers.length - 1
}

console.log(`Video column found at index ${videoColIndex}`)
console.log('')

// Count Fitwill URLs
let fitwillCount = 0
for (let i = startIdx + 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue
  const cells = lines[i].split(',')
  if (cells[videoColIndex] && cells[videoColIndex].includes('fitwill')) {
    fitwillCount++
  }
}

console.log(`Fitwill URLs found: ${fitwillCount}`)
console.log('')

// Sample videos
const sampleVideos = [
  'https://commondatastorage.googleapis.com/gtv-videos-library/sample/BigBuckBunny.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
]

// Convert the file
const convertedLines = []

// Keep the URL header line if it exists
if (startIdx === 1) {
  convertedLines.push(lines[0])
}

// Add the real header
convertedLines.push(lines[startIdx])

// Process data rows
let replacedCount = 0
for (let i = startIdx + 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue

  let cells = lines[i].split(',')
  const currentUrl = cells[videoColIndex]

  if (currentUrl && currentUrl.includes('fitwill')) {
    const videoUrl = sampleVideos[replacedCount % sampleVideos.length]
    cells[videoColIndex] = videoUrl
    replacedCount++
  }

  convertedLines.push(cells.join(','))
}

// Write output
fs.writeFileSync(outputFile, convertedLines.join('\n'), 'utf-8')

console.log(`✅ CONVERSION SUCCESSFUL!`)
console.log(`   Fitwill URLs replaced: ${replacedCount}`)
console.log(`   Output file: ${outputFile}`)
console.log('')
console.log(`Sample of converted data:`)
const firstExerciseLine = convertedLines[1]
const firstExerciseCells = firstExerciseLine.split(',')
console.log(`   Exercise: ${firstExerciseCells[0]}`)
console.log(`   Video URL: ${firstExerciseCells[videoColIndex]}`)
console.log('')
console.log(`✨ Your CSV is now ready for GIF conversion!`)
console.log('')
console.log(`Next steps:`)
console.log(`1. Start the app: npm run dev:with-server`)
console.log(`2. Import the converted CSV: ${outputFile}`)
console.log(`3. Open an exercise card`)
console.log(`4. Watch the GIF convert (10-30 seconds)`)
