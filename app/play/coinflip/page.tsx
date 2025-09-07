'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { decodeEventLog } from 'viem';

import { chaosCoinAbi, coinFlipAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const COINFLIP_ADDRESS = process.env.NEXT_PUBLIC_COINFLIP_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

type Step = 'choosing' | 'flipping' | 'finished';
type Action = 'placing_bet' | 'flipping_coin' | 'claiming_points';

export default function CoinFlipPage() {
  const { address } = useAccount();
  
  const [guessHeads, setGuessHeads] = useState<boolean>(true);
  const [step, setStep] = useState<Step>('choosing');
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [coinResult, setCoinResult] = useState<'heads' | 'tails'>('heads');
  const [hapticResult, setHapticResult] = useState<'win' | 'lose' | null>(null);
  const [currentAction, setCurrentAction] = useState<Action | null>(null);

  const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });
  const { data: hasActiveBet, refetch: refetchActiveBet } = useReadContract({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'hasActiveBet', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });
  const { data: pendingPoints, refetch: refetchPendingPoints } = useReadContract({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'pendingPoints', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });

  const { writeContractAsync, data: hash, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash });
  
  const hasEnoughCoins = useMemo(() => (coins ? coins >= BigInt(1) : false), [coins]);
  const hasPointsToClaim = useMemo(() => (pendingPoints ? pendingPoints > BigInt(0) : false), [pendingPoints]);

  async function placeBet() {
    if (!hasEnoughCoins) { toast.error('You need at least 1 coin to play.'); return; }
    setCurrentAction('placing_bet');
    const toastId = toast.loading('Placing your bet...');
    try { 
        await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'placeBet', args: [guessHeads] }); 
        toast.loading('Waiting for confirmation...', { id: toastId }); 
    } catch (e) { 
        toast.error('Transaction rejected.', { id: toastId }); 
        setCurrentAction(null); 
    }
  }

  async function flipCoin() {
    setCurrentAction('flipping_coin');
    const toastId = toast.loading('Flipping the coin...');
    try { 
        await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'flip', args: [] }); 
        toast.loading('Waiting for the on-chain result...', { id: toastId }); 
    } catch (e) { 
        toast.error('Transaction rejected.', { id: toastId }); 
        setCurrentAction(null); 
    }
  }

  async function claim() {
    setCurrentAction('claiming_points');
    const toastId = toast.loading('Claiming your points...');
    try { 
        await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'claimPoints', args: [] }); 
        toast.loading('Waiting for confirmation...', { id: toastId }); 
    } catch (e) { 
        toast.error('Transaction rejected.', { id: toastId }); 
        setCurrentAction(null); 
    }
  }

  // --- THIS IS THE FIX: EFFECT #1 - THE TRANSACTION HANDLER ---
  // This specialist hook ONLY runs when a transaction is confirmed. It cannot be interrupted.
  useEffect(() => {
    if (isConfirmed && receipt && currentAction) {
        const handleConfirmation = async () => {
            toast.dismiss();
            toast.success('Transaction Confirmed!');

            // Refetch all data FIRST to guarantee we have the latest state.
            await Promise.all([refetchCoins(), refetchActiveBet(), refetchPendingPoints()]);

            if (currentAction === 'placing_bet') {
                setStep('flipping');
            } else if (currentAction === 'claiming_points') {
                setStep('choosing');
            } else if (currentAction === 'flipping_coin') {
                let coinFlippedEvent;
                for (const log of receipt.logs) {
                    try { const event = decodeEventLog({ abi: coinFlipAbi, ...log }); if (event.eventName === 'CoinFlipped') { coinFlippedEvent = event; break; } } catch {}
                }

                if (coinFlippedEvent) {
                    const { win, resultHeads } = coinFlippedEvent.args;
                    setIsSpinning(true);
                    setTimeout(() => setCoinResult(resultHeads ? 'heads' : 'tails'), 100);
                    setTimeout(() => {
                        setIsSpinning(false);
                        setHapticResult(win ? 'win' : 'lose');
                        setStep('finished');
                    }, 1200);
                } else {
                    // Fallback if event isn't found, check the refetched data
                     if (pendingPoints && pendingPoints > BigInt(0)) {
                         setStep('finished');
                         setHapticResult('win');
                     } else {
                         setStep('finished');
                         setHapticResult('lose');
                     }
                }
            }
            
            setCurrentAction(null);
            resetWriteContract();
        };
        handleConfirmation();
    }
  }, [isConfirmed, receipt, currentAction, refetchCoins, refetchActiveBet, refetchPendingPoints, resetWriteContract]);
  
  // --- THIS IS THE FIX: EFFECT #2 - THE STATE SYNCHRONIZER ---
  // This hook sets the initial state and ONLY runs when nothing else is happening.
  useEffect(() => {
    // This is the guard clause. If a transaction is confirming or has just finished, DO NOTHING.
    if (isConfirming || currentAction) return;

    setHapticResult(null);
    if (hasPointsToClaim) {
        setStep('finished');
    } else if (hasActiveBet) {
        setStep('flipping');
    } else {
        setStep('choosing');
    }
  }, [hasActiveBet, hasPointsToClaim, isConfirming, currentAction, address]);

  const statusText = useMemo(() => {
    const isActionActive = isConfirming || currentAction;
    if (isActionActive) return 'Confirming in wallet...';

    if (step === 'choosing') return 'Choose a side and place your bet.';
    if (step === 'flipping') return 'Your bet is locked. Flip the coin!';
    if (step === 'finished') {
      if (hasPointsToClaim) return `You won! Claim your ${Number(pendingPoints)} points.`;
      return 'Unlucky. Better luck next time!';
    }
    return 'Ready.';
  }, [step, isConfirming, currentAction, hasPointsToClaim, pendingPoints]);

  const isButtonDisabled = isConfirming || !!currentAction;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-[220px] h-[220px]"> {/* Container for aura */}
            <div className={`absolute -inset-8 rounded-full transition-all duration-500 ${hapticResult === 'win' ? 'bg-emerald-500/30 shadow-[0_0_80px_rgba(52,211,153,0.5)]' : ''} ${hapticResult === 'lose' ? 'bg-rose-500/30 shadow-[0_0_80px_rgba(244,63,94,0.5)]' : ''}`}/>
            <div className={`coin ${isSpinning ? 'spin' : ''} ${coinResult === 'heads' ? 'show-heads' : 'show-tails'}`}>
              <div className="face heads" />
              <div className="face tails" />
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
                <button onClick={() => setGuessHeads(true)} disabled={step !== 'choosing' || isButtonDisabled} className={`choice ${guessHeads ? 'active' : ''} ${step !== 'choosing' || isButtonDisabled ? 'disabled' : ''}`}>Heads</button>
                <button onClick={() => setGuessHeads(false)} disabled={step !== 'choosing' || isButtonDisabled} className={`choice ${!guessHeads ? 'active' : ''} ${step !== 'choosing' || isButtonDisabled ? 'disabled' : ''}`}>Tails</button>
              </div>
            </div>
            <div>
              {step === 'choosing' && <button onClick={placeBet} disabled={isButtonDisabled} className="btn-cta">Place Bet (1 Coin)</button>}
              {step === 'flipping' && <button onClick={flipCoin} disabled={isButtonDisabled} className="btn-cta success">Flip the Coin</button>}
              {step === 'finished' && ( <> {hasPointsToClaim ? ( <button onClick={claim} disabled={isButtonDisabled} className="btn-cta glow">{`Claim ${Number(pendingPoints)} Points`}</button> ) : ( <button onClick={() => { setStep('choosing'); }} className="btn-cta">Play Again</button> )} </> )}
              {isButtonDisabled && <button disabled className="btn-cta animate-pulse">Waiting for Wallet...</button>}
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
