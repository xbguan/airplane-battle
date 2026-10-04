import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const outputDir = path.dirname(fileURLToPath(import.meta.url))
const sampleRate = 44100

// Pure synthesis shared by previews and any later approved runtime integration.
function synthesizeMechanicalSound(name, sampleRate) {
  const durations = { start: 1.05, hurt: .24, upgrade: .66, 'weapon-switch': .30 }
  const duration = durations[name]
  const data = new Float32Array(Math.ceil(sampleRate * duration))
  let seed = { start: 0x53545232, hurt: 0x48525432, upgrade: 0x55504732, 'weapon-switch': 0x53575432 }[name]
  let low = 0
  let slow = 0
  let rotorPhase = 0
  let bladePhase = 0
  const smooth = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x) }
  const pulse = (time, onset, attack, decay) => {
    const t = time - onset
    return t < 0 ? 0 : smooth(t / attack) * Math.exp(-t / decay)
  }
  for (let i = 0; i < data.length; i++) {
    const time = i / sampleRate
    const progress = i / (data.length - 1)
    let value = seed += 0x6d2b79f5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    const white = ((value ^ value >>> 14) >>> 0) / 4294967296 * 2 - 1
    // Sample-rate-aware noise bands: body and a short, softened metal transient.
    low += (1 - Math.exp(-2 * Math.PI * 2300 / sampleRate)) * (white - low)
    slow += (1 - Math.exp(-2 * Math.PI * 240 / sampleRate)) * (white - slow)
    const band = low - slow
    let sample = 0
    if (name === 'start') {
      rotorPhase += 2 * Math.PI * (68 + 155 * smooth(progress / .76)) / sampleRate
      bladePhase += 2 * Math.PI * (350 + 690 * smooth(progress / .86)) / sampleRate
      const spool = smooth(time / .18) * (1 - smooth((time - .67) / .38))
      const thrust = pulse(time, .30, .15, .30)
      const body = (Math.sin(rotorPhase) + .24 * Math.sin(rotorPhase * 2)) * spool * .095
      const turbine = (Math.sin(bladePhase) + .12 * Math.sin(bladePhase * 2.11)) * spool * .024
      const jet = band * thrust * .20 + slow * spool * .10
      const ignition = Math.sin(2 * Math.PI * 106 * time) * pulse(time, 0, .004, .055) * .12
      sample = body + turbine + jet + ignition
    } else if (name === 'hurt') {
      const impact = pulse(time, 0, .0015, .023)
      const shell = Math.sin(2 * Math.PI * 193 * time) * pulse(time, 0, .002, .062) * .17
      const dent = (Math.sin(2 * Math.PI * 487 * time) * .065 + Math.sin(2 * Math.PI * 791 * time) * .037) * pulse(time, 0, .002, .045)
      const rattle = band * (pulse(time, .037, .0015, .014) + pulse(time, .079, .0015, .019) * .6) * .16
      sample = band * impact * .27 + shell + dent + rattle
    } else if (name === 'upgrade') {
      rotorPhase += 2 * Math.PI * (145 + 95 * smooth(time / .44)) / sampleRate
      const servoEnvelope = smooth((time - .045) / .04) * (1 - smooth((time - .39) / .10))
      const servo = (Math.sin(rotorPhase) + .22 * Math.sin(rotorPhase * 3)) * servoEnvelope * .045
      let assembly = 0
      for (const [onset, frequency, gain] of [[.015, 590, .078], [.19, 730, .07], [.36, 480, .065]]) {
        const env = pulse(time, onset, .002, .037)
        assembly += (Math.sin(2 * Math.PI * frequency * (time - onset)) + band * 1.5) * env * gain
      }
      const lockTime = time - .49
      const lock = (Math.sin(2 * Math.PI * 152 * lockTime) * .15 + Math.sin(2 * Math.PI * 610 * lockTime) * .045 + band * .15) * pulse(time, .49, .002, .053)
      sample = servo + assembly + lock
    } else {
      const slide = band * pulse(time, .005, .012, .053) * .115
      const rail = Math.sin(2 * Math.PI * 330 * time) * pulse(time, .005, .01, .041) * .034
      const lockTime = time - .12
      const lock = (Math.sin(2 * Math.PI * 205 * lockTime) * .12 + Math.sin(2 * Math.PI * 860 * lockTime) * .065 + band * .18) * pulse(time, .12, .0018, .031)
      const catchTime = time - .173
      const catchClick = (Math.sin(2 * Math.PI * 660 * catchTime) * .06 + band * .08) * pulse(time, .173, .0015, .018)
      sample = slide + rail + lock + catchClick
    }
    data[i] = sample * smooth(time / .0015) * smooth((duration - time) / .02)
  }
  data[0] = 0
  data[data.length - 1] = 0
  return data
}

function wav(samples) {
  const result = Buffer.alloc(44 + samples.length * 2)
  result.write('RIFF', 0)
  result.writeUInt32LE(result.length - 8, 4)
  result.write('WAVEfmt ', 8)
  result.writeUInt32LE(16, 16)
  result.writeUInt16LE(1, 20)
  result.writeUInt16LE(1, 22)
  result.writeUInt32LE(sampleRate, 24)
  result.writeUInt32LE(sampleRate * 2, 28)
  result.writeUInt16LE(2, 32)
  result.writeUInt16LE(16, 34)
  result.write('data', 36)
  result.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) result.writeInt16LE(Math.round(samples[i] * (samples[i] < 0 ? 32768 : 32767)), 44 + 2 * i)
  return result
}

const manifest = [
  { key: 'start', name: '开始出击', duration: 1.05 },
  { key: 'hurt', name: '玩家受伤', duration: .24 },
  { key: 'upgrade', name: '武器升级', duration: .66 },
  { key: 'weapon-switch', name: '武器切换', duration: .30 }
]
const metrics = {}
for (const item of manifest) {
  for (const rate of [44100, 48000]) {
    const samples = synthesizeMechanicalSound(item.key, rate)
    assert.equal(samples.length, Math.ceil(item.duration * rate))
    assert.equal(samples[0], 0)
    assert.equal(samples.at(-1), 0)
    assert.ok(samples.every(Number.isFinite))
    let peak = 0
    let power = 0
    for (const value of samples) { peak = Math.max(peak, Math.abs(value)); power += value * value }
    assert.ok(peak > .01 && peak < .6)
    if (rate === sampleRate) {
      const encoded = wav(samples)
      fs.writeFileSync(path.join(outputDir, `${item.key}.wav`), encoded)
      metrics[item.key] = { duration: samples.length / rate, peak, rms: Math.sqrt(power / samples.length), firstSample: 0, lastSample: 0 }
    }
  }
}
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify({ status: '待试听确认，未接入游戏', sampleRate, channels: 1, bits: 16, sounds: manifest }, null, 2) + '\n')
fs.writeFileSync(path.join(outputDir, 'metrics.json'), JSON.stringify({ normalization: false, metrics }, null, 2) + '\n')
console.log(JSON.stringify(metrics, null, 2))
