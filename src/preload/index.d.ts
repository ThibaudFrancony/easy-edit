import type { EasyEditAPI } from '../shared/types'

declare global {
  interface Window {
    api: EasyEditAPI
  }
}
