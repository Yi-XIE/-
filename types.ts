export enum TeachingStage {
  Import = '情境导入',
  Explore = '自主探究',
  Practice = '动手实践',
  Expand = '拓展挑战',
  Share = '分享展示',
  Lab = '家庭AI-Lab'
}

export interface ScriptState {
  [TeachingStage.Import]: string;
  [TeachingStage.Explore]: string;
  [TeachingStage.Practice]: string;
  [TeachingStage.Expand]: string;
  [TeachingStage.Share]: string;
  [TeachingStage.Lab]: string;
}

export interface HistoryItem {
  id: string;
  content: string;
  timestamp: number;
  type: 'generate' | 'modify';
  summary?: string;
}

export type ScriptHistory = Record<TeachingStage, HistoryItem[]>;

export interface ReviewIssue {
  id?: string;
  quote?: string;
  comment: string;
  severity: 'high' | 'medium' | 'low';
  suggestion?: string;
  isManual?: boolean;
}

export interface ReviewResult {
  issues: ReviewIssue[];
}

export interface ReviewState {
  [key: string]: ReviewResult | null;
}

export interface GenerateRequest {
  courseFlow: string;
  experiments: string;
  stage: TeachingStage;
}