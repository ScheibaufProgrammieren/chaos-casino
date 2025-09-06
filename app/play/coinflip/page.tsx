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
  
  // --- THIS IS THE FIX ---
  // This new state variable "remembers" what button you just pressed.
  const [currentAction, setCurrentAction] = useState<Action | null>(null);

  const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });
  const { data: hasActiveBet, refetch: refetchActiveBet } = useReadContract({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'hasActiveBet', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });
  const { data: pendingPoints, refetch: refetchPendingPoints } = useReadContract({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'pendingPoints', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address }, });

  const { writeContractAsync, data: hash, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash });
  
  const hasEnoughCoins = useMemo(() => (coins ? coins >= 1 : false), [coins]);
  const hasPointsToClaim = useMemo(() => (pendingPoints ? pendingPoints > 0 : false), [pendingPoints]);

  async function placeBet() {
    if (!hasEnoughCoins) { toast.error('You need at least 1 coin to play.'); return; }
    setCurrentAction('placing_bet');
    const toastId = toast.loading('Placing your bet...');
    try { await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'placeBet', args: [guessHeads] }); toast.loading('Waiting for confirmation...', { id: toastId }); } 
    catch (e) { toast.error('Transaction rejected.', { id: toastId }); setCurrentAction(null); }
  }

  async function flipCoin() {
    setCurrentAction('flipping_coin');
    const toastId = toast.loading('Flipping the coin...');
    try { await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'flip', args: [] }); toast.loading('Waiting for the on-chain result...', { id: toastId }); } 
    catch (e) { toast.error('Transaction rejected.', { id: toastId }); setCurrentAction(null); }
  }

  async function claim() {
    setCurrentAction('claiming_points');
    const toastId = toast.loading('Claiming your points...');
    try { await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'claimPoints', args: [] }); toast.loading('Waiting for confirmation...', { id: toastId }); } 
    catch (e) { toast.error('Transaction rejected.', { id: toastId }); setCurrentAction(null); }
  }

  // --- THIS IS THE NEW, SMART, AND ONLY EFFECT HOOK ---
  useEffect(() => {
    const handleSync = async () => {
        // First, handle confirmations
        if (isConfirmed && receipt && currentAction) {
            toast.dismiss();
            toast.success('Transaction Confirmed!');
            resetWriteContract();

            // Refetch all data to get the latest state
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
                }
            }
            setCurrentAction(null); // Reset the action
            return; // Exit after handling confirmation
        }

        // If not confirming, just sync the UI state with the blockchain
        if (!isConfirming && !currentAction) {
            setHapticResult(null);
            if (hasPointsToClaim) { setStep('finished'); } 
            else if (hasActiveBet) { setStep('flipping'); } 
            else { setStep('choosing'); }
        }
    };
    handleSync();
  }, [isConfirmed, receipt, hasActiveBet, hasPointsToClaim, isConfirming]);

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
              {/* --- REMOVE THE H AND T FROM HERE --- */}
              <div className="face heads"></div>
              <div className="face tails"></div>
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
              {step === 'finished' && ( <> {hasPointsToClaim ? ( <button onClick={claim} disabled={isConfirming} className="btn-cta glow">{`Claim ${Number(pendingPoints)} Points`}</button> ) : ( <button onClick={() => { setStep('choosing'); setCurrentAction(null); }} className="btn-cta">Play Again</button> )} </> )}
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
