export type SourceType = 'folder' | 'file';
export type NotesPublicPolicy = false | 'toggle' | 'visible';

export interface DeckSourceConfig {
  type: SourceType;
  path: string;
}

export interface DeckSize {
  width: number;
  height: number;
}

export interface DeployConfig {
  target?: 's3';
  bucket?: string;
  cloudfrontDistributionId?: string;
}

export interface PressoConfigInput {
  title?: string;
  event?: string;
  date?: string;
  author?: string;
  excerpt?: string;
  tags?: string[];
  featureImage?: string;
  baseUrl?: string;
  aspectRatio?: string;
  size?: Partial<DeckSize>;
  source?: Partial<DeckSourceConfig>;
  theme?: string;
  rawHtml?: boolean;
  notes?: {
    public?: NotesPublicPolicy;
    defaultPrintLayout?: 'side' | 'below' | 'page';
  };
  deploy?: DeployConfig;
}

export interface ResolvedPressoConfig {
  rootDir: string;
  title: string;
  event?: string;
  date?: string;
  author: string;
  excerpt?: string;
  tags: string[];
  featureImage?: string;
  baseUrl?: string;
  aspectRatio: string;
  size: DeckSize;
  source: DeckSourceConfig;
  theme: string;
  rawHtml: boolean;
  notes: {
    public: NotesPublicPolicy;
    defaultPrintLayout: 'side' | 'below' | 'page';
  };
  deploy: DeployConfig;
}

export interface Slide {
  id: string;
  index: number;
  sourcePath: string;
  title: string;
  layout: string;
  class: string[];
  background?: string;
  backgroundFit?: string;
  time?: string;
  targetTimeSeconds?: number;
  bodyMarkdown: string;
  bodyHtml: string;
  notesMarkdown: string;
  notesHtml: string;
  metadata: Record<string, unknown>;
}

export interface Deck {
  config: ResolvedPressoConfig;
  slides: Slide[];
}

export interface OrderCheckResult {
  missing: string[];
  duplicate: string[];
  orphaned: string[];
}

