// app/layout.tsx
'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import Providers from './providers';
import { useAccount, useDisconnect, useChainId, useReadContract, useSwitchChain } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { chaosCoinAbi } from '@/lib/abi';
import { Toaster } from 'sonner';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

function HeaderHUD() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const { data: coins } = useReadContract({
    address: HUB_ADDRESS,
    abi: chaosCoinAbi,
    functionName: 'getCoins',
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const { data: points } = useReadContract({
    address: HUB_ADDRESS,
    abi: chaosCoinAbi,
    functionName: 'points',
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const coinsN = Number(coins ?? 0);
  const pointsN = Number(points ?? 0);
  const shortAddress = useMemo(() => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''), [address]);

  if (!mounted) {
    return <div className="h-9 w-[340px] animate-pulse rounded-md bg-white/10" />;
  }

  return (
    <div className="flex items-center gap-2">
      {address && (
        <>
          <div className="hidden grid-cols-2 gap-2 sm:grid">
            <div className="rounded-md bg-white/10 px-3 py-1.5 text-xs">
              <span className="mr-2 opacity-70">POINTS</span><span className="text-base font-bold">{pointsN}</span>
            </div>
            <div className="rounded-md bg-white/10 px-3 py-1.5 text-xs">
              <span className="mr-2 opacity-70">COINS</span><span className="text-base font-bold">{coinsN}</span>
            </div>
          </div>
          <div
            className={`ml-2 hidden items-center gap-2 rounded-md border px-2 py-1.5 text-xs sm:flex ${chainId === baseSepolia.id ? 'border-emerald-500/30 bg-emerald-400/10' : 'border-amber-500/30 bg-amber-400/10'}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${chainId === baseSepolia.id ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {chainId === baseSepolia.id ? 'Base Sepolia' : 'Wrong Network'}
            {chainId !== baseSepolia.id && ( <button onClick={() => switchChain({ chainId: baseSepolia.id })} disabled={isSwitching} className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">{isSwitching ? '...' : 'Switch'}</button> )}
          </div>
        </>
      )}
      <div className="ml-3">
        {address ? ( <button onClick={() => disconnect()} className="rounded-md border border-white/20 bg-transparent px-3 py-1.5 text-sm font-semibold hover:bg-white/10" title={address}>{shortAddress}</button> ) : ( <w3m-button balance="hide" size="sm" label="Connect" /> )}
      </div>
    </div>
  );
}
function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/50 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 text-white">
        <Link href="/" className="text-lg font-extrabold tracking-wide transition-transform hover:scale-105">
          CHAOS <span className="text-white/60">CASINO</span>
        </Link>
        <nav className="flex items-center gap-4">
            <Link href="/#games" className="hidden text-sm font-medium text-white/80 transition-colors hover:text-white sm:block">Games</Link>
            <Link href="/buy" className="hidden text-sm font-medium text-white/80 transition-colors hover:text-white sm:block">Buy Coins</Link>
            {/* --- THIS IS THE FIX --- */}
            <Link href="/collection" className="hidden text-sm font-medium text-white/80 transition-colors hover:text-white sm:block">My Collection</Link>
            <Link href="/redeem" className="hidden text-sm font-medium text-white/80 transition-colors hover:text-white sm:block">Redeem</Link>
            <HeaderHUD />
        </nav>
      </div>
    </header>
  );
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className="min-h-screen">
        <Providers>
            {/* --- THIS IS THE FIX: No more CollectionProvider --- */}
            <Header />
            {children}
        </Providers>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
