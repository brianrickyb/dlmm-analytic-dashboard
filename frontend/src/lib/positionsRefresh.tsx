import { createContext, useContext, useState, type ReactNode } from 'react';

interface PositionsRefreshValue {
  version: number;
  bump: () => void;
}

const PositionsRefreshContext = createContext<PositionsRefreshValue | undefined>(undefined);

export function PositionsRefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  return <PositionsRefreshContext.Provider value={{ version, bump }}>{children}</PositionsRefreshContext.Provider>;
}

export function usePositionsRefresh(): PositionsRefreshValue {
  const ctx = useContext(PositionsRefreshContext);
  if (!ctx) throw new Error('usePositionsRefresh must be used within PositionsRefreshProvider');
  return ctx;
}
