import { browser } from '$app/environment';
import type { Case, Activity, Note } from './store';

const STORAGE_KEY_CASES = 'casefile_data_v1';
const STORAGE_KEY_ACTIVITIES = 'casefile_activities_v1';
const STORAGE_KEY_NOTES = 'casefile_notes_v1';

export interface StorageData {
  cases: Case[];
  activities: Activity[];
  notes: Note[];
}

export interface StorageService {
  loadData(): StorageData | null;
  saveData(data: StorageData): void;
  clearData(): void;
}

export const localStoreService: StorageService = {
  loadData: () => {
    if (!browser) return null;
    try {
      const casesData = localStorage.getItem(STORAGE_KEY_CASES);
      const activitiesData = localStorage.getItem(STORAGE_KEY_ACTIVITIES);
      const notesData = localStorage.getItem(STORAGE_KEY_NOTES);
      
      let cases: Case[] = [];
      let activities: Activity[] = [];
      let notes: Note[] = [];

      if (casesData) {
        const parsed = JSON.parse(casesData);
        if (Array.isArray(parsed) && parsed.every(c => c && c.id && c.title)) {
          cases = parsed as Case[];
        }
      }

      if (activitiesData) {
        const parsed = JSON.parse(activitiesData);
        if (Array.isArray(parsed)) activities = parsed as Activity[];
      }

      if (notesData) {
        const parsed = JSON.parse(notesData);
        if (Array.isArray(parsed)) {
          // Migrate old notes that may be missing positionX/positionY
          notes = parsed.map((n: any) => ({
            ...n,
            positionX: typeof n.positionX === 'number' ? n.positionX : Math.random() * 300 + 50,
            positionY: typeof n.positionY === 'number' ? n.positionY : Math.random() * 200 + 50
          })) as Note[];
        }
      }
      
      // If no cases at all and no previous save detected, we might want to return null to seed initial data.
      // But if there's an empty array saved deliberately by the user, we should respect it.
      // We will rely on store logic: if it's the first time ever loading (keys missing), we return null to seed defaults.
      if (!casesData && !activitiesData && !notesData) {
         return null;
      }
      
      return { cases, activities, notes };
    } catch (e) {
      console.error('Failed to parse local storage data:', e);
      return null;
    }
  },
  
  saveData: (data: StorageData) => {
    if (!browser) return;
    try {
      localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(data.cases));
      localStorage.setItem(STORAGE_KEY_ACTIVITIES, JSON.stringify(data.activities));
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(data.notes));
    } catch (e) {
      console.error('Failed to save data to localStorage:', e);
    }
  },
  
  clearData: () => {
    if (!browser) return;
    localStorage.removeItem(STORAGE_KEY_CASES);
    localStorage.removeItem(STORAGE_KEY_ACTIVITIES);
    localStorage.removeItem(STORAGE_KEY_NOTES);
  }
};
