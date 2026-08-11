import { describe, expect, it } from 'vitest';
import { classifySentiment } from './sentiment.js';

describe('classifySentiment', () => {
  it('classifies a title with only positive keywords as positive', () => {
    expect(classifySentiment('Bitcoin surges to new record high')).toBe('positive');
  });

  it('classifies a title with only negative keywords as negative', () => {
    expect(classifySentiment('Exchange hacked, millions in crypto stolen')).toBe('negative');
  });

  it('classifies a title with no matching keywords as neutral', () => {
    expect(classifySentiment('Weekly roundup of Solana ecosystem updates')).toBe('neutral');
  });

  it('classifies a title with equal positive and negative matches as neutral', () => {
    expect(classifySentiment('Token rallies after hack, then crashes on adoption news')).toBe('neutral');
  });

  it('matches keywords case-insensitively', () => {
    expect(classifySentiment('BITCOIN SURGES PAST ALL-TIME HIGH')).toBe('positive');
  });

  it('does not match a keyword inside an unrelated word', () => {
    expect(classifySentiment('Urban development fund backs banana-themed NFT project')).toBe('neutral');
  });

  it('matches a multi-word phrase keyword', () => {
    expect(classifySentiment('Ethereum sets a new record high against the dollar')).toBe('positive');
  });
});
