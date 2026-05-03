import { IStorage } from './IStorage'
import { TrashItem } from './types'

export class TrashRepository {
  constructor(private storage: IStorage) {}

  async addItem(item: TrashItem): Promise<void> {
    const items = await this.storage.read()
    items.push(item)
    await this.storage.write(items)
  }

  async getItems(): Promise<TrashItem[]> {
    const items = await this.storage.read()
    const now = Date.now()
    return items.filter((item) => item.expireAt > now)
  }

  async getItemById(id: string): Promise<TrashItem | null> {
    const items = await this.getItems()
    return items.find((item) => item.id === id) ?? null
  }

  async deleteItem(id: string): Promise<void> {
    const items = await this.storage.read()
    const now = Date.now()
    const filtered = items.filter(
      (item) => item.id !== id && item.expireAt > now
    )
    await this.storage.write(filtered)
  }

  async clearExpired(): Promise<void> {
    const items = await this.storage.read()
    const now = Date.now()
    const valid = items.filter((item) => item.expireAt > now)
    await this.storage.write(valid)
  }
}
