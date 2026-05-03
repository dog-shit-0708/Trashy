export type TrashItem = {
  id: string;
  type: "text" | "image";
  content: string;
  createdAt: number;
  expireAt: number;
}
