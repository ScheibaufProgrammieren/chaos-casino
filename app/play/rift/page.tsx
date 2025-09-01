// app/play/rift/page.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { decodeEventLog } from 'viem';

import { chaosCoinAbi, quantumRiftAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const RIFT_ADDRESS = process.env.NEXT_PUBLIC_RIFT_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const RIFT_CHOICES = [ { id: 0, name: 'Stable Decay', multiplier: '1.6x', tag: 'Common' }, { id: 1, name: 'Chrono Surge', multiplier: '3.8x', tag: 'Uncommon' }, { id: 2, name: 'Void Echo', multiplier: '9.6x', tag: 'Rare' }, { id: 3, name: 'Paradox Bloom', multiplier: '19.2x', tag: 'Legendary' }, ];
type ActiveBet = { betId: bigint; amount: bigint; choice: number; };

export default function RiftPage() {
  const { address } = useAccount();
  
  const [selectedChoiceId, setSelectedChoiceId] = useState<number>(0);
  const [betAmount, setBetAmount] = useState<string>('10');
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([]);
  const [isLoadingBets, setIsLoadingBets] = useState<boolean>(true);
  const [lastResult, setLastResult] = useState<{ choice: number; outcome: number; payout: bigint } | null>(null);
  const [currentAction, setCurrentAction] = useState<{ type: 'placing' | 'resolving'; betId?: bigint } | null>(null);

  const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });
  const { writeContractAsync, data: hash, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash });

  const betAmountAsBigInt = BigInt(Number(betAmount) || 0);
  const hasEnoughCoins = useMemo(() => (coins ? coins >= betAmountAsBigInt : false), [coins, betAmountAsBigInt]);

  // --- NEW GUARANTEED SOLUTION: Load active bets from localStorage ---
  useEffect(() => {
    if (address) {
      setIsLoadingBets(true);
      const storedBets = localStorage.getItem(`activeRiftBets_${address}`);
      if (storedBets) {
        // This function correctly parses BigInts from the JSON string
        setActiveBets(JSON.parse(storedBets, (key, value) => typeof value === 'string' && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value));
      } else {
        setActiveBets([]);
      }
      setIsLoadingBets(false);
    } else {
      setActiveBets([]); // Clear bets if wallet disconnects
    }
  }, [address]);

  async function placeBet() {
    if (!hasEnoughCoins) { toast.error('Not enough coins for this bet.'); return; }
    if (betAmountAsBigInt <= 0) { toast.error('Please enter a bet amount.'); return; }
    setCurrentAction({ type: 'placing' });
    const toastId = toast.loading('Placing your bet...');
    try {
      await writeContractAsync({ address: RIFT_ADDRESS, abi: quantumRiftAbi, functionName: 'placeBet', args: [selectedChoiceId, betAmountAsBigInt] });
      toast.loading('Waiting for confirmation...', { id: toastId });
    } catch { toast.error('Transaction rejected.', { id: toastId }); setCurrentAction(null); }
  }
  
  async function resolveBet(betId: bigint) {
    setCurrentAction({ type: 'resolving', betId });
    const toastId = toast.loading(`Resolving Bet #${betId.toString()}...`);
    try {
      await writeContractAsync({ address: RIFT_ADDRESS, abi: quantumRiftAbi, functionName: 'resolveBet', args: [betId] });
      toast.loading('Waiting for the result...', { id: toastId });
    } catch { toast.error('Transaction rejected.', { id: toastId }); setCurrentAction(null); }
  }

  // --- NEW GUARANTEED SOLUTION: This useEffect now "remembers" and "forgets" bets from localStorage ---
  useEffect(() => {
    const handleConfirmation = async () => {
      if (isConfirmed && receipt && currentAction && address) {
        toast.dismiss();
        toast.success('Transaction Confirmed!');
        resetWriteContract();

        if (currentAction.type === 'placing') {
          let betPlacedEvent;
          for (const log of receipt.logs) { try { const event = decodeEventLog({ abi: quantumRiftAbi, ...log }); if (event.eventName === 'BetPlaced') { betPlacedEvent = event; break; } } catch {} }
          if (betPlacedEvent) {
            const { betId, amount, choice } = betPlacedEvent.args;
            const newBet: ActiveBet = { betId, amount, choice };
            const updatedBets = [...activeBets, newBet];
            setActiveBets(updatedBets);
            // This function correctly stores BigInts as a string
            localStorage.setItem(`activeRiftBets_${address}`, JSON.stringify(updatedBets, (key, value) => typeof value === 'bigint' ? value.toString() + 'n' : value));
            toast.info(`Bet #${betId.toString()} placed! Ready to resolve.`);
          }
        }

        if (currentAction.type === 'resolving') {
          const resolvedBetId = currentAction.betId;
          const updatedBets = activeBets.filter(b => b.betId !== resolvedBetId);
          setActiveBets(updatedBets);
          localStorage.setItem(`activeRiftBets_${address}`, JSON.stringify(updatedBets, (key, value) => typeof value === 'bigint' ? value.toString() + 'n' : value));
          
          let betSettledEvent;
          for (const log of receipt.logs) { try { const event = decodeEventLog({ abi: quantumRiftAbi, ...log }); if (event.eventName === 'BetSettled') { betSettledEvent = event; break; } } catch {} }
          if (betSettledEvent) {
            const { choice, outcome, payout } = betSettledEvent.args;
            setLastResult({ choice, outcome, payout });
            if(payout > 0) { toast.success(`You won! ${payout.toString()} points awarded.`); } else { toast.error('Unlucky. The Rift was unstable.'); }
          }
        }

        await refetchCoins();
        setCurrentAction(null);
      }
    };
    handleConfirmation();
  }, [isConfirmed, receipt, activeBets, address, currentAction, refetchCoins, resetWriteContract]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold">Quantum Rift</h1>
        <p className="mt-2 text-white/60">Choose your outcome. Embrace the chaos. Higher risk, insane rewards.</p>
      </div>
      <div className="mt-10 rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 ring-1 ring-white/5">
        <h2 className="text-lg font-semibold text-white/80">1. Select Outcome</h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {RIFT_CHOICES.map((choice) => ( <button key={choice.id} onClick={() => setSelectedChoiceId(choice.id)} className={`relative overflow-hidden rounded-lg p-4 text-left transition-all duration-200 ${selectedChoiceId === choice.id ? 'ring-2 ring-white scale-105' : 'ring-1 ring-white/10 hover:ring-white/30'}`}> <div className="text-sm font-bold opacity-70">{choice.tag}</div> <div className="text-lg font-semibold">{choice.name}</div> <div className="mt-2 text-2xl font-bold text-indigo-400">{choice.multiplier}</div> {lastResult && lastResult.outcome === choice.id && ( <div className={`absolute inset-0 animate-pulse ${lastResult.payout > 0 ? 'bg-emerald-500/30' : 'bg-rose-500/30'}`} /> )} </button> ))}
        </div>
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white/80">2. Set Bet Amount</h2>
          <div className="relative mt-2">
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-full rounded-xl border-white/10 bg-white/5 p-4 pr-24 text-2xl font-semibold outline-none ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white" placeholder="0" min="1" />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4"><span className="text-xl text-white/40">🪙</span></div>
          </div>
        </div>
        <div className="mt-8"><button onClick={placeBet} disabled={isConfirming || !hasEnoughCoins} className="btn-cta">Place Bet</button></div>
      </div>
      <div className="mt-8">
        <h2 className="text-xl font-bold text-center">Your Active Bets</h2>
        <div className="mt-4 space-y-3">
          {isLoadingBets && <p className="text-center text-white/50">Loading active bets...</p>}
          {!isLoadingBets && activeBets.length === 0 && <p className="text-center text-white/50">You have no pending bets.</p>}
          {activeBets.map((bet) => ( <div key={bet.betId.toString()} className="flex items-center justify-between rounded-lg bg-white/5 p-4 ring-1 ring-white/10"> <div> <p className="font-semibold">Bet #{bet.betId.toString()}</p> <p className="text-sm text-white/70">{bet.amount.toString()} Coins on {RIFT_CHOICES[bet.choice].name}</p> </div> <button onClick={() => resolveBet(bet.betId)} disabled={isConfirming} className="rounded-md bg-emerald-500/80 px-4 py-2 font-semibold text-black transition hover:bg-emerald-500 disabled:opacity-50">Resolve</button> </div> ))}
        </div>
      </div>
    </main>
  );
}