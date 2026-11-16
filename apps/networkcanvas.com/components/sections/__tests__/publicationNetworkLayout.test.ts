import { describe, expect, it } from 'vitest';

import { loadSiteContent, type Publication } from '~/lib/siteContent';

import {
  AUTHOR_RADIUS,
  buildAuthorshipGraph,
  type AuthorshipGraph,
} from '../publicationNetworkLayout';

const { publications } = await loadSiteContent('en-US');

function publication(id: string, authors: string): Publication {
  return {
    id,
    title: `Title ${id}`,
    source: 'Journal',
    authors,
    href: `https://example.com/${id}`,
    year: '2024',
  };
}

function circles(graph: AuthorshipGraph) {
  return [
    ...graph.hubs.map((hub) => ({
      id: `publication ${hub.index}`,
      x: hub.x,
      y: hub.y,
      r: hub.radius,
    })),
    ...[...graph.authors.values()].map((author) => ({
      id: `author ${author.key}`,
      x: author.x,
      y: author.y,
      r: AUTHOR_RADIUS,
    })),
  ];
}

describe('buildAuthorshipGraph', () => {
  it('lays out the site’s publications with no two nodes overlapping', () => {
    const graph = buildAuthorshipGraph(publications);
    const nodes = circles(graph);
    const overlaps: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (!a || !b) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) {
          overlaps.push(`${a.id} / ${b.id}`);
        }
      }
    }

    expect(graph.hubs).toHaveLength(publications.length);
    expect(overlaps).toEqual([]);
  });

  it('gives the same layout every time it runs', () => {
    const first = buildAuthorshipGraph(publications);
    const second = buildAuthorshipGraph(publications);

    expect(second.hubs).toEqual(first.hubs);
    expect([...second.authors.entries()]).toEqual([...first.authors.entries()]);
  });

  it('draws an author shared by several publications as one node joined to each', () => {
    const graph = buildAuthorshipGraph([
      publication('a', 'Shared S, Alone A'),
      publication('b', 'Other O'),
      publication('c', 'Other P, Shared S'),
    ]);

    expect(graph.authors.get('shared s')?.hubs).toEqual([0, 2]);
    expect(graph.authors.size).toBe(4);
    expect(graph.hubs[0]?.partners).toEqual([2]);
    expect(graph.hubs[1]?.partners).toEqual([]);
  });

  it('joins a shorter spelling of a name to the fuller one only alongside the same co-authors', () => {
    const graph = buildAuthorshipGraph([
      publication('full', 'Wagner GJ, Smith A, Jones B'),
      publication('short', 'Wagner G, Smith A, Jones B, Lee C'),
      publication('stranger', 'Wagner G, Doe D'),
    ]);

    expect(graph.authors.get('wagner gj')?.hubs).toEqual([0, 1]);
    // The "Wagner G" with none of those co-authors stays a separate person.
    expect(graph.authors.get('wagner g')?.hubs).toEqual([2]);
    expect(graph.authors.size).toBe(6);
  });
});
