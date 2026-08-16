import { useEffect, useRef } from 'react';

// TradingView's embed widgets mount by injecting a <script> tag with a JSON config as its text
// content into a container div -- React can't execute a <script> tag through JSX or
// dangerouslySetInnerHTML, so the DOM node has to be built imperatively. Shared by
// TradingViewChart and TradingViewTickerTape, which both follow this exact mount/cleanup shape.
export function useTradingViewWidget<T extends object>(scriptSrc: string, config: T) {
  const containerRef = useRef<HTMLDivElement>(null);
  const configJson = JSON.stringify(config);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Rebuild from scratch on every mount, including React StrictMode's dev-only double-invoke,
    // so a stale widget never sits alongside a fresh one.
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = scriptSrc;
    script.async = true;
    script.text = configJson;
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [scriptSrc, configJson]);

  return containerRef;
}
