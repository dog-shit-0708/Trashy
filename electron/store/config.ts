import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json')

export type AppConfig = {
  savePath: string // 数据文件目录，空串表示使用默认路径
}

const defaults: AppConfig = {
  savePath: '',
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8')
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return { ...defaults }
  }
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig()
  const updated = { ...current, ...partial }
  const dir = path.dirname(CONFIG_FILE)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}
