import type { KnowledgeSearchHit } from '../../../src/types/enablement';

export type DraftKnowledgeChunk = {
  ordinal: number;
  heading?: string;
  content: string;
  searchText: string;
};

export type SearchableKnowledgeChunk = DraftKnowledgeChunk & {
  id: string;
  documentId: string;
  versionId: string;
  title: string;
  versionNumber: number;
  updatedAt: string;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ').trim();
const terms = (value: string) => [...new Set(normalize(value).split(/\s+/).filter(Boolean).flatMap((term) => (
  term.length > 2 && /[\u4e00-\u9fff]/.test(term)
    ? [term, ...Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2))]
    : [term]
)))];

export function buildMarkdownChunks(markdown: string): DraftKnowledgeChunk[] {
  const sections: Array<{ heading?: string; lines: string[] }> = [];
  let current = { heading: undefined as string | undefined, lines: [] as string[] };

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
    if (heading) {
      if (current.lines.join('\n').trim() || current.heading) sections.push(current);
      current = { heading, lines: [] };
    } else {
      current.lines.push(line);
    }
  }

  if (current.lines.join('\n').trim() || current.heading) sections.push(current);

  return sections.map((section, ordinal) => {
    const content = section.lines.join('\n').trim();
    return {
      ordinal,
      heading: section.heading,
      content,
      searchText: normalize(`${section.heading || ''} ${content}`),
    };
  }).filter((chunk) => chunk.heading || chunk.content);
}

export interface KnowledgeSearchProvider {
  search(query: string, chunks: SearchableKnowledgeChunk[], limit: number): KnowledgeSearchHit[];
}

export function createKeywordKnowledgeSearchProvider(): KnowledgeSearchProvider {
  return {
    search(query, chunks, limit) {
      const queryTerms = terms(query);
      return chunks.map((chunk) => {
        const heading = normalize(chunk.heading || '');
        const score = queryTerms.reduce((total, term) => total
          + (heading.includes(term) ? 5 : 0)
          + (chunk.searchText.includes(term) ? 1 : 0), 0);
        return {
          documentId: chunk.documentId,
          versionId: chunk.versionId,
          title: chunk.title,
          heading: chunk.heading,
          excerpt: chunk.content.slice(0, 240),
          score,
          versionNumber: chunk.versionNumber,
          updatedAt: chunk.updatedAt,
        };
      }).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    },
  };
}
