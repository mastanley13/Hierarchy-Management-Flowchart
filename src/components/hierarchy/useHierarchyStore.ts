import { create } from 'zustand';
import type { Density } from './types';

type HierarchyState = {
  density: Density;
  setDensity: (density: Density) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  expandedIds: Set<string>;
  setExpandedIds: (ids: Iterable<string>) => void;
  toggleExpandedId: (id: string) => void;
  focusLens: boolean;
  setFocusLens: (value: boolean) => void;
  toggleFocusLens: () => void;
  highlightedPath: string[];
  setHighlightedPath: (ids: string[]) => void;
};

export const useHierarchyStore = create<HierarchyState>((set) => ({
  density: 'cozy',
  setDensity: (density) => set({ density }),
  theme: 'dark',
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  selectedNodeId: null,
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  expandedIds: new Set<string>(),
  setExpandedIds: (ids) => set({ expandedIds: new Set(ids) }),
  toggleExpandedId: (id) =>
    set((state) => {
      const next = new Set(state.expandedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expandedIds: next };
  }),
  focusLens: false,
  setFocusLens: (focusLens) => set({ focusLens }),
  toggleFocusLens: () => set((state) => ({ focusLens: !state.focusLens })),
  highlightedPath: [],
  setHighlightedPath: (highlightedPath) => set({ highlightedPath }),
}));

export const useDensity = () => useHierarchyStore((state) => state.density);
export const useTheme = () => useHierarchyStore((state) => state.theme);
export const useSelectedNodeId = () => useHierarchyStore((state) => state.selectedNodeId);
export const useExpandedIds = () => useHierarchyStore((state) => state.expandedIds);
export const useFocusLens = () => useHierarchyStore((state) => state.focusLens);
export const useHighlightedPath = () => useHierarchyStore((state) => state.highlightedPath);
