import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const outputDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(outputDir, '../../../../..')
const sourcePath = path.join(projectRoot, 'index.html')
const previewSampleRate = 44100
const runtimeAudioDir = path.join(outputDir, '..', 'runtime-audio')
const runtimeSoundNames = [
  'fire', 'machinegun', 'missile-launch', 'wizard-shot', 'orange-shot', 'blue-shot',
  'hit', 'laser', 'hurt', 'explode', 'boss', 'upgrade', 'start'
]

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

// Browser-portable candidate synthesis: this function only needs a sample rate
// and returns Float32 PCM suitable for copyToChannel/getChannelData.
function synthesizeMissileLaunch(sampleRate, seed = 0x4d495353) {
  const duration = 0.4
  const length = Math.ceil(sampleRate * duration)
  const data = new Float32Array(length)
  const random = mulberry32(seed)
  let ignitionPhase = 0
  let whistlePhase = 0
  let noiseLow = 0

  for (let i = 0; i < length; i++) {
    const time = i / sampleRate
    const progress = i / (length - 1)
    const edge = Math.min(1, time / 0.008, (duration - time) / 0.025)

    const ignitionProgress = Math.min(1, time / 0.13)
    const ignitionEnvelope = time < 0.13
      ? Math.sin(Math.PI * ignitionProgress) ** 1.4
      : 0
    const ignitionFrequency = 92 + 62 * ignitionProgress
    ignitionPhase += Math.PI * 2 * ignitionFrequency / sampleRate
    const ignition = Math.sin(ignitionPhase) * ignitionEnvelope * 0.075

    const white = random() * 2 - 1
    noiseLow += 0.12 * (white - noiseLow)
    const airyNoise = white - noiseLow
    const jetAttack = Math.min(1, time / 0.025)
    const jetRelease = (1 - progress) ** 1.55
    const jet = airyNoise * jetAttack * jetRelease * 0.078

    const whistleFrequency = 470 - 170 * progress
    whistlePhase += Math.PI * 2 * whistleFrequency / sampleRate
    const whistleEnvelope = Math.sin(Math.PI * progress) * (1 - progress) ** 1.3
    const whistle = Math.sin(whistlePhase) * whistleEnvelope * 0.022

    data[i] = (ignition + jet + whistle) * Math.max(0, edge)
  }

  data[0] = 0
  data[length - 1] = 0
  return data
}

// Frozen pre-confirmation sound for historical A/B comparisons.
function synthesizeOriginalMissile(sampleRate) {
  const length = Math.ceil(sampleRate * 0.14)
  const data = new Float32Array(length)
  let phase = 0
  for (let i = 0; i < length; i++) {
    const progress = i / length
    phase += Math.PI * 2 * (120 + (310 - 120) * progress) / sampleRate
    data[i] = (((phase / Math.PI) % 2) - 1) * (1 - progress) ** 2 * 0.16
  }
  return data
}

function extractProductionBuffers(sampleRate) {
  const html = fs.readFileSync(sourcePath, 'utf8')
  const match = html.match(/  function createSoundBuffer\(name\) \{[\s\S]*?\n  \}\n\n  function playSound/)
  if (!match) throw new Error('Could not extract production createSoundBuffer()')
  const functionSource = match[0].replace(/\n\n  function playSound$/, '')
  const soundBuffers = {}
  const audio = {
    sampleRate,
    createBuffer(channels, length, rate) {
      if (channels !== 1 || rate !== sampleRate) throw new Error('Unexpected production buffer format')
      const channel = new Float32Array(length)
      return { getChannelData: index => {
        if (index !== 0) throw new Error('Unexpected production channel')
        return channel
      } }
    }
  }
  const seededMath = Object.create(Math)
  seededMath.random = mulberry32(0x4558504c)
  const context = vm.createContext({ audio, soundBuffers, Math: seededMath })
  vm.runInContext(`function ensureAudio() { return audio }\n${functionSource}\nthis.createSoundBuffer = createSoundBuffer`, context)
  return Object.fromEntries(runtimeSoundNames.map(name => [name, context.createSoundBuffer(name).getChannelData(0)]))
}

function mixTimeline(sampleRate, duration, events) {
  const output = new Float32Array(Math.ceil(sampleRate * duration))
  for (const { time, samples, gain = 1 } of events) {
    const offset = Math.round(time * sampleRate)
    for (let i = 0; i < samples.length && offset + i < output.length; i++) {
      output[offset + i] += samples[i] * gain
    }
  }
  return output
}

function battleMix(sampleRate, missile) {
  const { machinegun } = extractProductionBuffers(sampleRate)
  const events = []
  for (let time = 0; time < 6; time += 0.09) events.push({ time, samples: machinegun })
  for (let time = 0; time < 6; time += 1.5) events.push({ time, samples: missile })
  return mixTimeline(sampleRate, 6, events)
}

function concatenateWithGap(first, second, sampleRate, gapSeconds = 0.35) {
  const gap = new Float32Array(Math.round(sampleRate * gapSeconds))
  const output = new Float32Array(first.length + gap.length + second.length)
  output.set(first)
  output.set(gap, first.length)
  output.set(second, first.length + gap.length)
  return output
}

function metrics(samples, sampleRate) {
  let peak = 0
  let sumSquares = 0
  let sum = 0
  for (const sample of samples) {
    if (!Number.isFinite(sample)) throw new Error('PCM contains a non-finite sample')
    peak = Math.max(peak, Math.abs(sample))
    sumSquares += sample * sample
    sum += sample
  }
  return {
    sampleRate,
    samples: samples.length,
    durationSeconds: samples.length / sampleRate,
    peak,
    peakDbfs: peak ? 20 * Math.log10(peak) : null,
    rms: Math.sqrt(sumSquares / samples.length),
    rmsDbfs: sumSquares ? 20 * Math.log10(Math.sqrt(sumSquares / samples.length)) : null,
    dcOffset: sum / samples.length,
    firstSample: samples[0],
    lastSample: samples[samples.length - 1],
    headroom: 1 - peak,
    normalized: false
  }
}

function encodeWav(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), 44 + i * 2)
  }
  return buffer
}

function assert(condition, message) {
  if (!condition) throw new Error(`Validation failed: ${message}`)
}

const production = extractProductionBuffers(previewSampleRate)
const candidate = synthesizeMissileLaunch(previewSampleRate)
const original = synthesizeOriginalMissile(previewSampleRate)
const comparison = concatenateWithGap(original, candidate, previewSampleRate)
const battleOriginal = battleMix(previewSampleRate, original)
const battleCandidate = battleMix(previewSampleRate, candidate)

const rateMetrics = {}
for (const sampleRate of [22050, 44100, 48000]) {
  const first = synthesizeMissileLaunch(sampleRate)
  const second = synthesizeMissileLaunch(sampleRate)
  assert(first.length === Math.ceil(sampleRate * 0.4), `${sampleRate} Hz candidate length`)
  assert(first.every((value, index) => value === second[index]), `${sampleRate} Hz deterministic seeded noise`)
  const measured = metrics(first, sampleRate)
  assert(Math.abs(measured.firstSample) <= 1e-7, `${sampleRate} Hz starts at zero`)
  assert(Math.abs(measured.lastSample) <= 1e-7, `${sampleRate} Hz ends at zero`)
  assert(measured.peak < 0.28, `${sampleRate} Hz candidate peak below 0.28`)
  assert(measured.rms > 0.012 && measured.rms < 0.09, `${sampleRate} Hz candidate RMS in moderate range`)
  assert(Math.abs(measured.dcOffset) < 0.002, `${sampleRate} Hz candidate DC offset`)
  rateMetrics[sampleRate] = measured
}

const report = {
  source: {
    file: 'index.html',
    extraction: 'createSoundBuffer evaluated with a vm AudioBuffer stub',
    machinegunDefinition: [205, 108, 0.052, 0.14, 'square'],
    originalMissileDefinition: [120, 310, 0.14, 0.16, 'saw'],
    missileDefinition: 'confirmed 0.4 second layered launch transient',
    comparisonSource: 'Frozen original algorithm and confirmed candidate; runtimeAudio follows current source'
  },
  candidate: {
    design: 'low short ignition + airy filtered jet + quiet fading whistle',
    seededNoise: true,
    rates: rateMetrics
  },
  previews: {
    original: metrics(original, previewSampleRate),
    candidate: metrics(candidate, previewSampleRate),
    comparison: metrics(comparison, previewSampleRate),
    battleOriginal: metrics(battleOriginal, previewSampleRate),
    battleCandidate: metrics(battleCandidate, previewSampleRate)
  },
  battleTimeline: {
    durationSeconds: 6,
    machinegunIntervalSeconds: 0.09,
    missileIntervalSeconds: 1.5,
    machinegunGain: 1,
    missileGain: 1,
    normalizationApplied: false
  },
  runtimeAudio: {
    sampleRate: previewSampleRate,
    source: 'Current index.html createSoundBuffer definitions',
    reproducibility: 'explode uses seeded Math.random for preview export only',
    usage: { fire: 'dormant (defined but no playSound caller)', others: 'active' },
    sounds: Object.fromEntries(runtimeSoundNames.map(name => [name, metrics(production[name], previewSampleRate)]))
  }
}

assert(report.previews.battleOriginal.peak < 1, 'original battle mix has headroom')
assert(report.previews.battleCandidate.peak < 1, 'candidate battle mix has headroom')
assert(report.previews.battleCandidate.peak < 0.5, 'candidate remains child-friendly in battle mix')

const files = {
  'original.wav': original,
  'candidate.wav': candidate,
  'comparison.wav': comparison,
  'battle-original.wav': battleOriginal,
  'battle-candidate.wav': battleCandidate
}
for (const [name, samples] of Object.entries(files)) {
  fs.writeFileSync(path.join(outputDir, name), encodeWav(samples, previewSampleRate))
}
fs.mkdirSync(runtimeAudioDir, { recursive: true })
for (const name of runtimeSoundNames) {
  fs.writeFileSync(path.join(runtimeAudioDir, `${name}.wav`), encodeWav(production[name], previewSampleRate))
}
fs.writeFileSync(path.join(runtimeAudioDir, 'metrics.json'), `${JSON.stringify(report.runtimeAudio, null, 2)}\n`)
fs.writeFileSync(path.join(outputDir, 'metrics.json'), `${JSON.stringify(report, null, 2)}\n`)

console.log(JSON.stringify(report, null, 2))

export { synthesizeMissileLaunch }
