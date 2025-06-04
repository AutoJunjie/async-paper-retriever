export interface SearchResult {
  id: number;
  title: string;
  authors: string;
  journal: string;
  year: number;
  relevanceScore: number;
  abstract: string;
  aiReasoning: string;
}

export interface SearchTask {
  id: number;
  keyword: string;
  status: 'Pending' | 'Searching' | 'Evaluating' | 'Completed';
  createdAt: string;
  totalResults: number | null;
  relevantResults: number | null;
  results: SearchResult[];
}

export interface StatusConfig {
  [key: string]: {
    color: string;
    icon: string;
    progress: number;
  };
} 