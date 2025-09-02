'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { decodeEventLog } from 'viem';
import Link from 'next/link';

import { chaosCoinAbi, aethericAnvilAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const ANVIL_ADDRESS = process.env.NEXT_PUBLIC_ANVIL_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// Single source of truth for Rune data
const RUNE_DATA: { [key: number]: { name: string, image: string, description: string } } = {
    0: { name: "Rune of Flux", image: "/0.png", description: "Pulsates with unstable energy." },
    1: { name: "Rune of Entropy", image: "/1.png", description: "Hums with cosmic decay." },
    2: { name: "Rune of Gravity", image: "/2.png", description: "Bends the space around it." },
    3: { name: "Rune of Singularity", image: "/3.png", description: "Born from a collapsed star." },
    4: { name: "Rune of Parallax", image: "/4.png", description: "Refracts reality itself." },
};

type ForgeResult = { outcome: string; pointsWon: bigint; tokenId: bigint; image?: string; name?: string; };

// --- THIS IS THE NEW VISUAL ---
// Replaces the boring fire emoji with a sick lootbox visual
const ForgeVisual = ({ isForging, result }: { isForging: boolean; result: ForgeResult | null }) => {
    const isNftWin = result?.outcome === 'Rune Spark' || result?.outcome === 'Genesis Forge';
    const isPointsWin = result?.pointsWon > 0 && !isNftWin;
    const isFizzle = result && !isNftWin && !isPointsWin;

    return (
        <div className="relative flex h-80 w-80 items-center justify-center">
            {/* The background glow */}
            <div className={`absolute inset-0 rounded-full transition-all duration-500 ${isForging ? 'bg-orange-500/30 animate-pulse' : ''} ${result ? 'bg-indigo-500/30' : ''}`} />
            
            {/* The Box */}
            <div className={`relative flex h-64 w-64 items-center justify-center rounded-2xl border border-white/10 bg-gray-900/50 shadow-lg transition-all duration-300 ${isForging ? 'animate-bounce' : ''}`}>
                <div className="text-8xl">
                    {result ? ' ' : '💎'}
                </div>
            </div>

            {/* The Revealed Prize */}
            <div className={`absolute transition-all duration-500 ${result ? 'opacity-100 scale-110' : 'opacity-0 scale-50'}`}>
                {isNftWin && <img src={result.image} alt={result.name} className="h-72 w-72 object-contain" />}
                {isPointsWin && <div className="text-9xl">🪙</div>}
                {isFizzle && <div className="text-9xl">💨</div>}
            </div>
        </div>
    );
};


// --- THIS IS THE NEW MODAL WITH THE SMART BUTTON ---
const RevealModal = ({ result, onClose }: { result: ForgeResult | null; onClose: () => void }) => {
    if (!result) return null;
    
    const isNftWin = result.outcome === 'Rune Spark' || result.outcome === 'Genesis Forge';
    const isPointsWin = result.pointsWon > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="relative max-w-sm rounded-2xl bg-gray-900 p-6 ring-1 ring-white/10 animate-[fade-in-up_0.5s_ease-out]">
                <h2 className="text-center text-2xl font-bold">{isPointsWin ? 'Forge Successful!' : 'A Dud...'}</h2>
                
                <div className="mt-4 aspect-square w-full rounded-lg bg-black/30 p-4">
                    {result.image ? (
                        <img src={result.image} alt={result.name} className="w-full h-full object-contain" />
                    ) : (
                        <div className="flex items-center justify-center h-full text-6xl text-white/50">
                            {isPointsWin ? '🪙' : '💨'}
                        </div>
                    )}
                </div>
                
                {result.name && <p className="mt-2 text-center font-semibold text-amber-300">{result.name}</p>}
                
                <p className="mt-1 text-center text-white/70">
                    {isPointsWin ? `You were awarded ${result.pointsWon.toString()} points.` : "No points were awarded."}
                </p>
                
                {/* --- THIS IS THE NEW CONDITIONAL BUTTON --- */}
                {isNftWin ? (
                    <Link href="/collection" onClick={onClose} className="btn-cta glow mt-6 text-center block">
                        View My Collection
                    </Link>
                ) : (
                    <button onClick={onClose} className="btn-cta mt-6">
                        Forge Again
                    </button>
                )}
            </div>
        </div>
    );
};


export default function AnvilPage() {
  const { address } = useAccount();
  
  const [activeStrikes, setActiveStrikes] = useState<bigint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastResult, setLastResult] = useState<ForgeResult | null>(null);
  const [currentAction, setCurrentAction] = useState<{ type: 'striking' | 'resolving'; strikeId?: bigint; toastId?: string | number } | null>(null);
  const [isRevealing, setIsRevealing] = useState<boolean>(false);

  const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });
  const { writeContractAsync, data: hash, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash });

  const hasEnoughCoins = coins ? coins >= 10 : false;

  useEffect(() => {
    if (address) {
      setIsLoading(true);
      const storedStrikes = localStorage.getItem(`activeAnvilStrikes_${address}`);
      setActiveStrikes(storedStrikes ? JSON.parse(storedStrikes, (key, value) => typeof value === 'string' && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value) : []);
      setIsLoading(false);
    } else { setActiveStrikes([]); }
  }, [address]);

  async function strikeAnvil() {
    if (!hasEnoughCoins) { toast.error('You need 10 coins to strike the anvil.'); return; }
    const toastId = toast.loading('Sending transaction to your wallet...');
    setCurrentAction({ type: 'striking', toastId });
    setLastResult(null); // Reset the visual
    try { 
      await writeContractAsync({ address: ANVIL_ADDRESS, abi: aethericAnvilAbi, functionName: 'strikeAnvil' }); 
      toast.loading('Waiting for confirmation...', { id: toastId }); 
    } catch (e) { 
        console.error("Strike Anvil transaction failed:", e);
        toast.error('Transaction rejected.', { id: toastId }); 
        setCurrentAction(null); 
    }
  }

  async function resolveForge(strikeId: bigint) {
    const toastId = toast.loading(`Revealing the outcome of Forge #${strikeId.toString()}...`);
    setCurrentAction({ type: 'resolving', strikeId, toastId });
    try { await writeContractAsync({ address: ANVIL_ADDRESS, abi: aethericAnvilAbi, functionName: 'resolveForge', args: [strikeId] }); } 
    catch (e) { 
        console.error("Resolve Forge transaction failed:", e);
        toast.error('Transaction rejected.', { id: toastId }); 
        setCurrentAction(null); 
    }
  }

  useEffect(() => {
    const handleConfirmation = async () => {
      if (!isConfirmed || !receipt || !currentAction || !address) return;
      
      const toastId = currentAction.toastId;

      resetWriteContract();
      await refetchCoins();

      if (currentAction.type === 'striking') {
        let struckEvent;
        for (const log of receipt.logs) { try { const event = decodeEventLog({ abi: aethericAnvilAbi, ...log }); if (event.eventName === 'AnvilStruck') { struckEvent = event; break; } } catch {} }
        if (struckEvent) {
          const { strikeId } = struckEvent.args;
          const updatedStrikes = [...activeStrikes, strikeId];
          setActiveStrikes(updatedStrikes);
          localStorage.setItem(`activeAnvilStrikes_${address}`, JSON.stringify(updatedStrikes, (key, value) => typeof value === 'bigint' ? value.toString() + 'n' : value));
          toast.success(`Strike #${strikeId.toString()} is ready to be resolved!`, { id: toastId });
        } else {
            toast.error("Something went wrong with the strike. Please try again.", { id: toastId });
        }
      }

      if (currentAction.type === 'resolving') {
        const resolvedStrikeId = currentAction.strikeId!;
        const updatedStrikes = activeStrikes.filter(id => id !== resolvedStrikeId);
        setActiveStrikes(updatedStrikes);
        localStorage.setItem(`activeAnvilStrikes_${address}`, JSON.stringify(updatedStrikes, (key, value) => typeof value === 'bigint' ? value.toString() + 'n' : value));
        
        let settledEvent;
        for (const log of receipt.logs) { try { const event = decodeEventLog({ abi: aethericAnvilAbi, ...log }); if (event.eventName === 'ForgeSettled') { settledEvent = event; break; } } catch {} }
        
        if (settledEvent) {
          const { outcome, pointsWon, tokenId } = settledEvent.args;
          if (outcome === 'Rune Spark' || outcome === 'Genesis Forge') {
              const randomVal = Number(tokenId) % 5;
              const runeData = RUNE_DATA[randomVal] || RUNE_DATA[0];
              setLastResult({ outcome, pointsWon, tokenId, name: runeData.name, image: runeData.image });
              toast.success(`LEGENDARY FORGE! You minted the ${runeData.name}!`, { id: toastId });
          } else {
              setLastResult({ outcome, pointsWon, tokenId });
              if (pointsWon > 0) { toast.info(`Success! You forged ${pointsWon.toString()} points.`, { id: toastId }); }
              else { toast.error('Fizzle... the forge was unstable.', { id: toastId }); }
          }
          setIsRevealing(true);
        } else {
            toast.success("Forge resolved! Check your collection to see the results.", { id: toastId });
        }
      }
      setCurrentAction(null);
    };
    handleConfirmation();
  }, [isConfirmed, receipt]);

  const isActionDisabled = isConfirming || !!currentAction;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <RevealModal result={isRevealing ? lastResult : null} onClose={() => setIsRevealing(false)} />
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div className="flex items-center justify-center">
            <ForgeVisual isForging={isActionDisabled} result={lastResult} />
        </div>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 ring-1 ring-white/5">
          <h1 className="text-3xl font-extrabold">Aetheric Anvil</h1>
          <p className="mt-2 text-white/60">Forge for glory. Spend 10 coins for a chance to mint a permanent, on-chain Chaos Rune NFT.</p>
          <div className="mt-8 rounded-lg border border-dashed border-white/20 p-4 text-center">
            <p className="text-sm text-white/70">Possible Outcomes</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <p>45% - Fizzle (Nothing)</p><p>35% - Shards (50 Pts)</p>
              <p>15% - <span className="text-purple-400">Uncommon NFT</span></p><p>5% - <span className="text-amber-400">Rare NFT</span></p>
            </div>
          </div>
          <div className="mt-8"><button onClick={strikeAnvil} disabled={isActionDisabled || !hasEnoughCoins} className="btn-cta glow">Strike the Anvil (10 Coins)</button></div>
        </div>
      </div>
      <div className="mt-16">
          <h2 className="text-2xl font-bold text-center">Pending Forges</h2>
          <div className="mt-6 max-w-md mx-auto space-y-3">
            {isLoading && <p className="text-center text-sm text-white/50">Loading...</p>}
            {!isLoading && activeStrikes.length === 0 && <p className="text-center text-sm text-white/50">You have no pending forges.</p>}
            {activeStrikes.map(strikeId => ( <div key={strikeId.toString()} className="flex items-center justify-between rounded-lg bg-white/5 p-4 ring-1 ring-white/10"> <p className="font-semibold">Forge #{strikeId.toString()}</p> <button onClick={() => resolveForge(strikeId)} disabled={isActionDisabled} className="rounded-md bg-emerald-500/80 px-4 py-2 font-semibold text-black transition hover:bg-emerald-500 disabled:opacity-50">{currentAction?.type === 'resolving' && currentAction?.strikeId === strikeId ? '...' : 'Resolve'}</button></div> ))}
          </div>
      </div>
       <div className="mt-16 text-center">
        <Link href="/collection" className="inline-block rounded-lg bg-white/10 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/20">
            View My Collection
        </Link>
      </div>
    </main>
  );
}
