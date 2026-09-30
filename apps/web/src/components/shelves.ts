// Lesson 4.1: the names of my shelves, used by several components
import type { ReadingState } from '../api/hooks'

export const SHELF_LABELS: Record<ReadingState, string> = { to_read: 'Want to read', reading: 'Reading', read: 'Read' }
export const SHELVES: ReadingState[] = ['to_read', 'reading', 'read']
