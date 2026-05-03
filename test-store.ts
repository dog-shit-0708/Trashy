/**
 * Trashy Store 验收测试
 * 
 * 用法：npx tsx test-store.ts
 * 
 * 测试内容：
 * ✓ addItem / getItems
 * ✓ 过期自动过滤
 * ✓ getItemById
 * ✓ deleteItem
 * ✓ clearExpired
 * ✓ JSON文件自动创建
 * ✓ IStorage接口可替换
 */

import path from 'node:path'
import fs from 'node:fs/promises'

// ── 内联 store 实现（不依赖 electron） ──────────────────────

interface TrashItem {
  id: string
  type: 'text' | 'image'
  content: string
  createdAt: number
  expireAt: number
}

interface IStorage {
  read(): Promise<TrashItem[]>
  write(data: TrashItem[]): Promise<void>
}

class JsonStorage implements IStorage {
  private filePath: string
  private lock: Promise<void> = Promise.resolve()

  constructor(private dir: string, filename = 'trash.json') {
    this.filePath = path.join(dir, filename)
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void
    const prev = this.lock
    this.lock = new Promise<void>((resolve) => { release = resolve })
    await prev
    try { return await fn() }
    finally { release!() }
  }

  private async ensureFile() {
    await fs.mkdir(this.dir, { recursive: true })
    try { await fs.access(this.filePath) }
    catch { await fs.writeFile(this.filePath, '[]', 'utf-8') }
  }

  async read(): Promise<TrashItem[]> {
    return this.withLock(async () => {
      await this.ensureFile()
      return JSON.parse(await fs.readFile(this.filePath, 'utf-8'))
    })
  }

  async write(data: TrashItem[]): Promise<void> {
    return this.withLock(async () => {
      await this.ensureFile()
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    })
  }
}

class TrashRepository {
  constructor(private storage: IStorage) {}

  async addItem(item: TrashItem) {
    const items = await this.storage.read()
    items.push(item)
    await this.storage.write(items)
  }

  async getItems() {
    const items = await this.storage.read()
    const now = Date.now()
    return items.filter(i => i.expireAt > now)
  }

  async getItemById(id: string) {
    const items = await this.getItems()
    return items.find(i => i.id === id) ?? null
  }

  async deleteItem(id: string) {
    const items = await this.storage.read()
    const now = Date.now()
    await this.storage.write(items.filter(i => i.id !== id && i.expireAt > now))
  }

  async clearExpired() {
    const items = await this.storage.read()
    const now = Date.now()
    await this.storage.write(items.filter(i => i.expireAt > now))
  }
}

// ── 测试 ──────────────────────────────────────────────

const __filename = new URL('', import.meta.url).pathname
const __dirname = path.dirname(__filename)
const testDir = path.join(__dirname, '.test-temp')

async function main() {
const filePath = path.join(testDir, 'trash.json')

try { await fs.rm(testDir, { recursive: true }) } catch {}

const storage = new JsonStorage(testDir)
const repo = new TrashRepository(storage)

const now = Date.now()
const ONE_DAY = 24 * 60 * 60 * 1000

let passed = 0
let failed = 0

function assert(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✓ ${name}`); passed++ }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failed++ }
}

// Test 1
console.log('\n❖ addItem + getItems')
await repo.addItem({ id: '1', type: 'text', content: 'hello', createdAt: now, expireAt: now + ONE_DAY })
await repo.addItem({ id: '2', type: 'image', content: '/img.png', createdAt: now, expireAt: now + ONE_DAY })
let items = await repo.getItems()
assert('新增2条，返回2条', items.length === 2)
assert('第1条text', items[0].type === 'text')
assert('第2条image', items[1].type === 'image')

// Test 2
console.log('\n❖ 过期自动过滤')
await repo.addItem({ id: '3', type: 'text', content: 'expired', createdAt: now - 48 * ONE_DAY, expireAt: now - ONE_DAY })
items = await repo.getItems()
assert('过期数据过滤，仍为2条', items.length === 2)
assert('不含id=3', !items.find(i => i.id === '3'))

// Test 3
console.log('\n❖ getItemById')
assert('找到id=1', (await repo.getItemById('1'))?.id === '1')
assert('不存在返回null', await repo.getItemById('nonexist') === null)
assert('过期返回null', await repo.getItemById('3') === null)

// Test 4
console.log('\n❖ deleteItem')
await repo.deleteItem('1')
items = await repo.getItems()
assert('删除后剩1条', items.length === 1)
assert('剩下id=2', items[0].id === '2')

// Test 5
console.log('\n❖ clearExpired')
await repo.addItem({ id: '4', type: 'text', content: 'expiring', createdAt: now - 48 * ONE_DAY, expireAt: now - ONE_DAY })
await repo.addItem({ id: '5', type: 'text', content: 'valid', createdAt: now, expireAt: now + ONE_DAY })
await repo.clearExpired()
items = await repo.getItems()
assert('清理后保留2条', items.length === 2)
assert('含id=2', !!items.find(i => i.id === '2'))
assert('含id=5', !!items.find(i => i.id === '5'))
assert('不含id=4', !items.find(i => i.id === '4'))

// Test 6
console.log('\n❖ JSON文件自动创建')
try { await fs.access(filePath); assert('trash.json 已自动创建', true) }
catch { assert('trash.json 已自动创建', false, '文件不存在') }

// Test 7
console.log('\n❖ IStorage 接口可替换')
class MockStorage implements IStorage {
  private data: TrashItem[] = []
  async read() { return this.data }
  async write(data: TrashItem[]) { this.data = data }
}
const mockRepo = new TrashRepository(new MockStorage())
await mockRepo.addItem({ id: 'm1', type: 'text', content: 'mock', createdAt: now, expireAt: now + ONE_DAY })
const mockItems = await mockRepo.getItems()
assert('MockStorage 替换后正常工作', mockItems.length === 1 && mockItems[0].id === 'm1')

// 清理
await fs.rm(testDir, { recursive: true })

const total = passed + failed
console.log(`\n═══════════════════`)
console.log(`测试完成: ${passed}/${total} 通过`)
if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('测试出错:', err)
  process.exit(1)
})
