import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders nothing when there are fewer than 2 data points', () => {
    const { container: empty } = render(<Sparkline data={[]} />);
    expect(empty.querySelector('svg')).toBeNull();

    const { container: single } = render(<Sparkline data={[42]} />);
    expect(single.querySelector('svg')).toBeNull();
  });

  it('draws one point per data value', () => {
    const { container } = render(<Sparkline data={[1, 5, 3, 4]} />);
    const polyline = container.querySelector('polyline')!;
    const points = polyline.getAttribute('points')!.trim().split(/\s+/);
    expect(points).toHaveLength(4);
  });

  it('colors the line green when the series trends up (last >= first)', () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />);
    const polyline = container.querySelector('polyline')!;
    expect(polyline.getAttribute('stroke')).toBe('var(--green)');
  });

  it('colors the line red when the series trends down', () => {
    const { container } = render(<Sparkline data={[3, 2, 1]} />);
    const polyline = container.querySelector('polyline')!;
    expect(polyline.getAttribute('stroke')).toBe('var(--red)');
  });
});
