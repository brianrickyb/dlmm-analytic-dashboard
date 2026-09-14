interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ data, width = 64, height = 24 }: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data
    .map((value, i) => {
      const x = i * stepX;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const trendUp = data[data.length - 1] >= data[0];
  const color = trendUp ? 'var(--green)' : 'var(--red)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={trendUp ? 'trending up' : 'trending down'}
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
