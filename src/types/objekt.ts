export type ObjektQuery = Readonly<{ member: 'S12_YEONJI' }>;

export type Objekt = {
  id: string;
  member: 'S12_YEONJI';
  title: string;
  imageUrl: string | null;
  series: string;
  season: string;
  className: string;
  issuedAt: string | null;
  serial: string | null;
  description: string | null;
  isDemo: boolean;
};

export type Catalog = {
  items: Objekt[];
  sourceCount: number;
  skippedCount: number;
  isDemo: boolean;
};

export type SortMode = 'newest' | 'oldest' | 'title';
export type CollectionMode = 'all' | 'favorites';
export type BracketSize = 4 | 8 | 16 | 32;

export type TournamentSnapshot = {
  entries: string[];
  next: string[];
  matchIndex: number;
  champion: string | null;
};

export type TournamentState = TournamentSnapshot & {
  status: 'idle' | 'playing' | 'complete';
  size: BracketSize;
  history: TournamentSnapshot[];
};
