import { TrashItem } from './types'

export interface IStorage {
  read(): Promise<TrashItem[]>
  write(data: TrashItem[]): Promise<void>
}
