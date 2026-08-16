import { useEffect, useRef, useState } from 'react';

export type TradingViewWidgetStatus = 'loading' | 'error' | 'ready';

// TradingView's embed widgets mount by injecting a <script> tag with a JSON config as its text
// content into a container div -- React can't execute a <script> tag via JSX or
// dangerouslySetInnerHTML, so the DOM node has to be built imperatively. Shared by
// TradingViewChart and TradingViewTickerTape, which both follow this exact mount/cleanup shape.
//
// `script.onload` only confirms the outer bootstrap script executed, not that the (cross-origin,
// so unobservable from here) iframe finished rendering -- that's the best readiness signal these
// widgets expose short of polling their internal state, and it's enough to distinguish "blocked
// by an ad blocker / offline" (onerror) from "loading" from "probably fine".
export function useTradingViewWidget<T extends object>(scriptSrc: string, config: T) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<TradingViewWidgetStatus>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const configJson = JSON.stringify(config);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setStatus('loading');

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
    script.onload = () => setStatus('ready');
    script.onerror = () => setStatus('error');
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [scriptSrc, configJson, retryCount]);

  const retry = () => setRetryCount((n) => n + 1);

  return { containerRef, status, retry };
}
