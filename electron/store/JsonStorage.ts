import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { IStorage } from './IStorage'
import { TrashItem } from './types'

export class JsonStorage implements IStorage {
  private filePath: string
  private lock: Promise<void> = Promise.resolve()

  constructor(filename?: string, customDir?: string) {
    const dataDir = customDir ?? path.join(process.cwd(), 'data')
    this.filePath = path.join(dataDir, filename ?? 'trash.json')
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void
    const prev = this.lock
    this.lock = new Promise<void>((resolve) => { release = resolve })
    await prev
    try {
      return await fn()
    } finally {
      release!()
    }
  }

  private async ensureFile(): Promise<void> {
    const dir = path.dirname(this.filePath)
    await fs.mkdir(dir, { recursive: true })
    try {
      await fs.access(this.filePath)
    } catch {
      await fs.writeFile(this.filePath, '[]', 'utf-8')
    }
  }

  async read(): Promise<TrashItem[]> {
    return this.withLock(async () => {
      await this.ensureFile()
      const raw = await fs.readFile(this.filePath, 'utf-8')
      return JSON.parse(raw) as TrashItem[]
    })
  }

  async write(data: TrashItem[]): Promise<void> {
    return this.withLock(async () => {
      await this.ensureFile()
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    })
  }
}
