// app/play/coinflip/page.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { decodeEventLog, type Abi } from 'viem'; // Use type-only import

import { chaosCoinAbi, coinFlipAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const COINFLIP_ADDRESS = process.env.NEXT_PUBLIC_COINFLIP_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

type Step = 'choosing' | 'placing_bet' | 'flipping' | 'claiming' | 'finished';

export default function CoinFlipPage() {
  const { address } = useAccount();
  
  const [guessHeads, setGuessHeads] = useState<boolean>(true);
  const [step, setStep] = useState<Step>('choosing');
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [coinResult, setCoinResult] = useState<'heads' | 'tails'>('heads');
  const [hapticResult, setHapticResult] = useState<'win' | 'lose' | null>(null);

  // --- FIX: Add a dependency array to our read hooks so they can be manually refetched ---
  const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });
  const { data: hasActiveBet, refetch: refetchActiveBet } = useReadContract({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'hasActiveBet', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });
  const { data: pendingPoints, refetch: refetchPendingPoints } = useReadContract({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'pendingPoints', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });

  const { writeContractAsync, data: hash, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash });
  
  const hasEnoughCoins = useMemo(() => (coins ? coins >= 1 : false), [coins]);
  const hasPointsToClaim = useMemo(() => (pendingPoints ? pendingPoints > 0 : false), [pendingPoints]);

  async function placeBet() {
    if (!hasEnoughCoins) { toast.error('You need at least 1 coin to play.'); return; }
    setStep('placing_bet');
    const toastId = toast.loading('Placing your bet...');
    try { await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'placeBet', args: [guessHeads] }); toast.loading('Waiting for confirmation...', { id: toastId }); } 
    catch (e) { toast.error('Transaction rejected.', { id: toastId }); setStep('choosing'); }
  }

  async function flipCoin() {
    setStep('flipping');
    const toastId = toast.loading('Flipping the coin...');
    try { await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'flip', args: [] }); toast.loading('Waiting for the on-chain result...', { id: toastId }); } 
    catch (e) { toast.error('Transaction rejected.', { id: toastId }); setStep('flipping'); }
  }

  async function claim() {
    setStep('claiming');
    const toastId = toast.loading('Claiming your points...');
    try { await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'claimPoints', args: [] }); toast.loading('Waiting for confirmation...', { id: toastId }); } 
    catch (e) { toast.error('Transaction rejected.', { id: toastId }); setStep('finished'); }
  }

  // --- THIS IS THE MAIN FIX ---
  // We now use an async function inside useEffect to handle the logic flow correctly.
  useEffect(() => {
    if (isConfirmed && receipt) {
      const handleConfirmation = async () => {
        toast.dismiss();
        toast.success('Transaction Confirmed!');

        // Always reset the hook first
        resetWriteContract();

        // Step 1: Force refetch ALL data
        await Promise.all([refetchCoins(), refetchActiveBet(), refetchPendingPoints()]);

        // Step 2: Check for the CoinFlipped event to handle the animation
        let coinFlippedEvent;
        for (const log of receipt.logs) {
          try {
            const event = decodeEventLog({ abi: coinFlipAbi, ...log });
            if (event.eventName === 'CoinFlipped') { coinFlippedEvent = event; break; }
          } catch {}
        }

        // Step 3: Explicitly set the next UI step based on the transaction that just confirmed
        if (step === 'placing_bet') {
          setStep('flipping'); // After placing a bet, we now have an active bet, so move to flip step
        } else if (step === 'claiming') {
          setStep('choosing'); // After claiming, we are done, go back to the start
        } else if (step === 'flipping' && coinFlippedEvent) {
          const { win, resultHeads } = coinFlippedEvent.args;
          setIsSpinning(true);
          setTimeout(() => setCoinResult(resultHeads ? 'heads' : 'tails'), 100);
          setTimeout(() => {
            setIsSpinning(false);
            setHapticResult(win ? 'win' : 'lose');
            setStep('finished'); // The flip is done, go to the results/claim step
          }, 1200);
        }
      };
      handleConfirmation();
    }
  }, [isConfirmed, receipt, resetWriteContract, refetchCoins, refetchActiveBet, refetchPendingPoints, step]);
  
  // This second useEffect is now only for synchronizing state when the page first loads
  useEffect(() => {
    if (isConfirming) return;
    setHapticResult(null);
    if (hasPointsToClaim) { setStep('finished'); } 
    else if (hasActiveBet) { setStep('flipping'); } 
    else { setStep('choosing'); }
  }, [hasActiveBet, hasPointsToClaim, isConfirming]);

  const statusText = useMemo(() => {
    if (isConfirming) return 'Confirming in wallet...';
    if (step === 'choosing') return 'Choose a side and place your bet.';
    if (step === 'flipping') return 'Your bet is locked. Flip the coin!';
    if (step === 'finished') {
      if(hasPointsToClaim) return `You won! Claim your ${Number(pendingPoints)} points.`;
      return 'Unlucky. Better luck next time!';
    }
    return 'Ready.';
  }, [step, isConfirming, hasPointsToClaim, pendingPoints]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div className="flex flex-col items-center justify-center">
          <div className="bg-coin-aura">
            <div className={`coin ${isSpinning ? 'spin' : ''} ${coinResult === 'heads' ? 'show-heads' : 'show-tails'} ${hapticResult === 'win' ? 'coin-win' : hapticResult === 'lose' ? 'coin-lose' : ''}`} >
              <div className="face heads">H</div>
              <div className="face tails">T</div>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 ring-1 ring-white/5">
          <h1 className="text-3xl font-extrabold">Classic Coin Flip</h1>
          <p className="mt-2 text-white/60">Costs 1 Coin. Win 100 Points. Pure, simple, chaos.</p>
          <div className="mt-8 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white/80">1. Choose Your Fate</h2>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <button onClick={() => setGuessHeads(true)} disabled={step !== 'choosing'} className={`choice ${guessHeads ? 'active' : ''} ${step !== 'choosing' ? 'disabled' : ''}`}>Heads</button>
                <button onClick={() => setGuessHeads(false)} disabled={step !== 'choosing'} className={`choice ${!guessHeads ? 'active' : ''} ${step !== 'choosing' ? 'disabled' : ''}`}>Tails</button>
              </div>
            </div>
            <div>
              {step === 'choosing' && <button onClick={placeBet} disabled={isConfirming} className="btn-cta">Place Bet (1 Coin)</button>}
              {step === 'flipping' && <button onClick={flipCoin} disabled={isConfirming} className="btn-cta success">Flip the Coin</button>}
              {step === 'finished' && ( <> {hasPointsToClaim ? ( <button onClick={claim} disabled={isConfirming} className="btn-cta glow">{`Claim ${Number(pendingPoints)} Points`}</button> ) : ( <button onClick={() => setStep('choosing')} className="btn-cta">Play Again</button> )} </> )}
              {isConfirming && <button disabled className="btn-cta animate-pulse">Waiting for Wallet...</button>}
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-sm text-white/80">
              {statusText}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}