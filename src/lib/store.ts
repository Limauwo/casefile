import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { localStoreService } from './storage';

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'open' | 'in_progress' | 'closed';

export interface Case {
  id: string;
  caseNumber: string;
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Activity {
  id: string;
  timestamp: string;
  action: 'create' | 'update' | 'status_change' | 'priority_change' | 'delete' | 'system';
  description: string;
  relatedCaseId?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  relatedCaseId?: string;
  createdAt: string;
  updatedAt: string;
  positionX: number;
  positionY: number;
}

// Initial Data
const initialCases: Case[] = [
  {
    id: 'uuid-1',
    caseNumber: 'CASE-002',
    title: 'Investigate SvelteKit Architecture',
    description: 'Review documentation and establish foundational layout for the new intelligence terminal.',
    priority: 'high',
    status: 'in_progress',
    dueDate: '2026-10-10',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'uuid-2',
    caseNumber: 'CASE-001',
    title: 'Analyze Database Schema',
    description: 'Cross-reference expected relations in user tables with current models.',
    priority: 'medium',
    status: 'open',
    dueDate: '2026-10-12',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const initialActivities: Activity[] = [
  { id: 'act-1', timestamp: new Date().toISOString(), action: 'system', description: 'System initialized. Authorized access granted.' },
  { id: 'act-2', timestamp: new Date().toISOString(), action: 'create', description: 'CASE-042 was created', relatedCaseId: 'uuid-1' }
];

const initialNotes: Note[] = [
  { id: 'note-1', title: 'Suspect Profiling', content: 'The bug appears to occur only on weekends. Could be related to UTC boundary crossing.', relatedCaseId: 'uuid-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), positionX: 100, positionY: 100 }
];

// Stores
export const isInitialized = writable<boolean>(false);
export const cases = writable<Case[]>(initialCases);
export const activities = writable<Activity[]>(initialActivities);
export const notes = writable<Note[]>(initialNotes);
export const searchQuery = writable<string>('');
export const filterStatus = writable<Status | 'all'>('all');
export const filterPriority = writable<Priority | 'all'>('all');

// Helper to log activities
function logActivity(action: Activity['action'], description: string, relatedCaseId?: string) {
  activities.update((items: Activity[]) => {
    return [{
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      description,
      relatedCaseId
    }, ...items];
  });
}

// Case Actions
export function addCase(newCase: Omit<Case, 'id' | 'caseNumber' | 'createdAt' | 'updatedAt'>) {
  cases.update((items: Case[]) => {
    const id = crypto.randomUUID();
    const maxNum = items.reduce((max: number, c: Case) => {
      const numMatch = c.caseNumber.match(/CASE-(\d+)/);
      if (numMatch) {
        return Math.max(max, parseInt(numMatch[1], 10));
      }
      return max;
    }, 0);
    const caseNumber = `CASE-${("000" + (maxNum + 1)).slice(-3)}`;
    
    logActivity('create', `Created ${caseNumber}: ${newCase.title}`, id);
    
    return [{
      ...newCase,
      id,
      caseNumber,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, ...items];
  });
}

export function updateCase(id: string, updates: Partial<Case>) {
  cases.update((items: Case[]) => {
    return items.map((c: Case) => {
      if (c.id === id) {
        const updated = { ...c, ...updates, updatedAt: new Date().toISOString() };
        
        if (updates.status && updates.status !== c.status) {
          logActivity('status_change', `Status of ${c.caseNumber} changed to ${updates.status.toUpperCase()}`, c.id);
          if (updates.status === 'closed') {
            updated.completedAt = new Date().toISOString();
          } else {
            updated.completedAt = undefined;
          }
        }
        
        if (updates.priority && updates.priority !== c.priority) {
          logActivity('priority_change', `Priority of ${c.caseNumber} escalated to ${updates.priority.toUpperCase()}`, c.id);
        }
        
        // Log generic update if it wasn't just status/priority
        if (!updates.status && !updates.priority) {
           logActivity('update', `Metadata updated for ${c.caseNumber}`, c.id);
        }

        return updated;
      }
      return c;
    });
  });
}

export function deleteCase(id: string) {
  let caseNumber = 'Unknown';
  cases.update((items: Case[]) => {
    const target = items.find((c: Case) => c.id === id);
    if (target) caseNumber = target.caseNumber;
    return items.filter((c: Case) => c.id !== id);
  });
  
  // Also delete associated notes
  notes.update((items: Note[]) => items.filter(n => n.relatedCaseId !== id));
  
  logActivity('delete', `Expunged record for ${caseNumber}`);
}

export function toggleCaseStatus(id: string) {
  cases.update((items: Case[]) => {
    return items.map((c: Case) => {
      if (c.id === id) {
        if (c.status === 'closed') {
          logActivity('status_change', `Reopened ${c.caseNumber}`, c.id);
          return { ...c, status: 'open', completedAt: undefined, updatedAt: new Date().toISOString() };
        } else {
          logActivity('status_change', `Closed ${c.caseNumber}`, c.id);
          return { ...c, status: 'closed', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        }
      }
      return c;
    });
  });
}

// Note Actions
export function addNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'positionX' | 'positionY'> & Partial<Pick<Note, 'positionX' | 'positionY'>>) {
  notes.update((items: Note[]) => {
    return [{
      ...note,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      positionX: note.positionX ?? (Math.random() * 200 + 50),
      positionY: note.positionY ?? (Math.random() * 200 + 50)
    }, ...items];
  });
  logActivity('create', `Added new intelligence note: ${note.title}`, note.relatedCaseId);
}

export function updateNote(id: string, updates: Partial<Note>) {
  notes.update((items: Note[]) => {
    return items.map((n: Note) => {
      if (n.id === id) {
        logActivity('update', `Updated intelligence note: ${n.title}`, n.relatedCaseId);
        return { ...n, ...updates, updatedAt: new Date().toISOString() };
      }
      return n;
    });
  });
}

export function deleteNote(id: string) {
  let noteTitle = 'Unknown';
  notes.update((items: Note[]) => {
    const n = items.find((x: Note) => x.id === id);
    if (n) noteTitle = n.title;
    return items.filter((x: Note) => x.id !== id);
  });
  logActivity('delete', `Deleted intelligence note: ${noteTitle}`);
}


// Storage Initialization
export function initializeStore() {
  if (!browser) return;
  
  const savedData = localStoreService.loadData();
  if (savedData) {
    cases.set(savedData.cases);
    activities.set(savedData.activities);
    notes.set(savedData.notes);
  }
  
  isInitialized.set(true);
  
  // Setup auto-save listener that aggregates all stores
  cases.subscribe(() => saveState());
  activities.subscribe(() => saveState());
  notes.subscribe(() => saveState());
}

let saveTimeout: any;
function saveState() {
  if (!browser) return;
  // Debounce saving to prevent thrashing
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    localStoreService.saveData({
      cases: get(cases),
      activities: get(activities),
      notes: get(notes)
    });
  }, 300);
}

export function clearAllData() {
  if (!browser) return;
  const emptyData = { cases: [], activities: [], notes: [] };
  localStoreService.saveData(emptyData);
  cases.set(emptyData.cases);
  activities.set(emptyData.activities);
  notes.set(emptyData.notes);
}
