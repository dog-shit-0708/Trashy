import type { PetState } from './PetCat'

const GIF_ROOT = '/GIF'

export const PET_GIFS: Record<PetState, string> = {
  idle: `${GIF_ROOT}/idle.gif`,
  sleeping: `${GIF_ROOT}/looping.gif`,
  eating: `${GIF_ROOT}/eating.gif`,
  pooping: `${GIF_ROOT}/looping.gif`,
  waking: `${GIF_ROOT}/wake.gif`,
}
