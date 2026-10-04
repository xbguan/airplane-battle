import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const outputDir = path.dirname(fileURLToPath(import.meta.url))
const sampleRate = 44100

// Deterministic mechanical Foley: short rail friction, spring return and damped metal contacts.
function synthesizeFirearmSound(name, sampleRate) {
  const upgrading = name === 'upgrade'
  const duration = upgrading ? .72 : .32
  const contacts = upgrading
    ? [[.018, .075, 730, .022], [.12, .11, 490, .027], [.32, .07, 1120, .017], [.545, .20, 245, .043], [.586, .085, 890, .026]]
    : [[.012, .06, 970, .017], [.16, .145, 355, .036], [.198, .09, 1190, .020]]
  const slides = upgrading ? [[.17, .15, .075], [.37, .15, .10]] : [[.022, .10, .09]]
  const samples = new Float32Array(Math.ceil(duration * sampleRate))
  let seed = upgrading ? 0x55504733 : 0x53575433
  let low = 0
  let slow = 0
  const smooth = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x) }
  const fastAlpha = 1 - Math.exp(-2 * Math.PI * 4200 / sampleRate)
  const slowAlpha = 1 - Math.exp(-2 * Math.PI * 480 / sampleRate)
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate
    let word = seed += 0x6d2b79f5
    word = Math.imul(word ^ word >>> 15, word | 1)
    word ^= word + Math.imul(word ^ word >>> 7, word | 61)
    const white = ((word ^ word >>> 14) >>> 0) / 4294967296 * 2 - 1
    low += fastAlpha * (white - low)
    slow += slowAlpha * (white - slow)
    const metalNoise = low - slow
    let sound = 0
    for (const [onset, gain, frequency, decay] of contacts) {
      const t = time - onset
      if (t < 0) continue
      const attack = smooth(t / .0009)
      const strike = metalNoise * Math.exp(-t / .007) * 1.55
      const body = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decay) * .64
      const metal = (Math.sin(2 * Math.PI * frequency * 2.37 * t) * .25 + Math.sin(2 * Math.PI * frequency * 3.91 * t) * .12) * Math.exp(-t / (decay * .45))
      sound += (strike + body + metal) * gain * attack
    }
    for (const [onset, length, gain] of slides) {
      const t = time - onset
      if (t < 0 || t >= length) continue
      const progress = t / length
      const motion = Math.sin(Math.PI * progress) ** .65
      const teeth = .62 + .38 * Math.sin(2 * Math.PI * (46 * t + 220 * t * t)) ** 2
      sound += metalNoise * motion * teeth * gain
    }
    const release = time - (upgrading ? .49 : .12)
    if (release >= 0) {
      const spring = Math.sin(2 * Math.PI * 1630 * release) * .025 + Math.sin(2 * Math.PI * 2287 * release) * .009
      sound += spring * smooth(release / .001) * Math.exp(-release / .016)
    }
    samples[i] = sound * smooth(time / .001) * smooth((duration - time) / .025)
  }
  samples[0] = 0
  samples[samples.length - 1] = 0
  return samples
}

function encodeWav(samples) {
  const out = Buffer.alloc(44 + samples.length * 2)
  out.write('RIFF', 0); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22)
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * 2, 28)
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36)
  out.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.round(samples[i] * (samples[i] < 0 ? 32768 : 32767)), 44 + i * 2)
  return out
}

const metrics = {}
for (const key of ['upgrade', 'weapon-switch']) {
  for (const rate of [44100, 48000]) {
    const samples = synthesizeFirearmSound(key, rate)
    assert.equal(samples.length, Math.ceil(rate * (key === 'upgrade' ? .72 : .32)))
    assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0)
    assert.ok(samples.every(Number.isFinite))
    let peak = 0, energy = 0
    for (const value of samples) { peak = Math.max(peak, Math.abs(value)); energy += value * value }
    assert.ok(peak > .02 && peak < .6)
    if (rate === sampleRate) {
      fs.writeFileSync(path.join(outputDir, `${key}.wav`), encodeWav(samples))
      metrics[key] = { duration: samples.length / rate, peak, rms: Math.sqrt(energy / samples.length), firstSample: 0, lastSample: 0 }
    }
  }
}
fs.writeFileSync(path.join(outputDir, 'metrics.json'), JSON.stringify({ sampleRate, channels: 1, bits: 16, normalization: false, status: '待试听确认，未接入游戏', metrics }, null, 2) + '\n')
console.log(JSON.stringify(metrics, null, 2))
