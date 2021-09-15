/**
 * Typescript
 */

export interface Commit {
  message: string;
  messageMore: string;
  hash: string;
  username: string;
  email: string;
  files: number;
  additions: number;
  deletions: number;
  added: boolean;
}

export interface ChangelogEntry {
  text: string;
  hashes: string[];
}
