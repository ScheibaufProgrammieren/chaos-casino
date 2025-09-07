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

  const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
  const { data: hasActiveBet, refetch: refetchActiveBet } = useReadContract({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'hasActiveBet', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
  const { data: pendingPoints, refetch: refetchPendingPoints } = useReadContract({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'pendingPoints', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });

  const { writeContractAsync, data: hash, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash });
  
  const hasEnoughCoins = useMemo(() => (coins ? coins >= BigInt(1) : false), [coins]);
  const hasPointsToClaim = useMemo(() => (pendingPoints ? pendingPoints > BigInt(0) : false), [pendingPoints]);

  async function placeBet() {
    if (!hasEnoughCoins) { toast.error('You need at least 1 coin to play.'); return; }
    setCurrentAction('placing_bet');
    try { 
        await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'placeBet', args: [guessHeads] }); 
        toast.info('Waiting for confirmation...'); 
    } catch (e) { 
        toast.error('Transaction rejected.'); 
        setCurrentAction(null); 
    }
  }

  async function flipCoin() {
    setCurrentAction('flipping_coin');
    try { 
        await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'flip', args: [] }); 
        toast.info('Flipping the coin...'); 
    } catch (e) { 
        toast.error('Transaction rejected.'); 
        setCurrentAction(null); 
    }
  }

  async function claim() {
    setCurrentAction('claiming_points');
    try { 
        await writeContractAsync({ address: COINFLIP_ADDRESS, abi: coinFlipAbi, functionName: 'claimPoints', args: [] }); 
        toast.info('Claiming your points...'); 
    } catch (e) { 
        toast.error('Transaction rejected.'); 
        setCurrentAction(null); 
    }
  }

  // --- THIS IS THE FINAL, BULLETPROOF HOOK ---
  useEffect(() => {
    // This hook syncs the UI with the blockchain state ONCE on page load,
    // or when the user connects/disconnects their wallet.
    // It is explicitly told to DO NOTHING if a transaction is in progress.
    if (isConfirming || currentAction) return;

    setHapticResult(null); // Clear any win/loss glow
    if (hasPointsToClaim) {
        setStep('finished');
    } else if (hasActiveBet) {
        setStep('flipping');
    } else {
        setStep('choosing');
    }
  }, [address, hasActiveBet, hasPointsToClaim, isConfirming, currentAction]);

  useEffect(() => {
    // This specialist hook is the BOSS. It ONLY handles transaction confirmations.
    if (isConfirmed && receipt && currentAction) {
        const handleConfirmation = async () => {
            toast.dismiss();

            // First, get the REAL result from the transaction receipt
            let winResult: boolean | undefined;
            let resultHeads: boolean | undefined;
            
            if (currentAction === 'flipping_coin') {
                let coinFlippedEvent;
                for (const log of receipt.logs) {
                    try { 
                        const event = decodeEventLog({ abi: coinFlipAbi, ...log }); 
                        if (event.eventName === 'CoinFlipped') { coinFlippedEvent = event; break; } 
                    } catch {}
                }
                if (coinFlippedEvent) {
                    winResult = coinFlippedEvent.args.win;
                    resultHeads = coinFlippedEvent.args.resultHeads;
                }
            }
            
            // Second, FORCE the UI to update based on what we KNOW just happened.
            // NO waiting, NO refreshing. We TELL the app what to do.
            if (currentAction === 'placing_bet') {
                toast.success('Bet placed successfully!');
                setStep('flipping'); // <-- The important part
            } else if (currentAction === 'claiming_points') {
                toast.success('Points claimed!');
                setStep('choosing'); // <-- The important part
            } else if (currentAction === 'flipping_coin') {
                if (winResult !== undefined) {
                    setIsSpinning(true);
                    setTimeout(() => setCoinResult(resultHeads ? 'heads' : 'tails'), 100);
                    setTimeout(() => {
                        setIsSpinning(false);
                        setHapticResult(winResult ? 'win' : 'lose');
                        setStep('finished'); // <-- The important part
                    }, 1200);
                } else {
                    toast.error("Couldn't determine flip result. Please refresh.");
                }
            }

            // Finally, refetch the on-chain data in the background for the next action.
            await Promise.all([refetchCoins(), refetchActiveBet(), refetchPendingPoints()]);
            setCurrentAction(null); // The action is complete.
            resetWriteContract(); // Reset the transaction hook.
        };
        handleConfirmation();
    }
  }, [isConfirmed, receipt, currentAction, resetWriteContract, refetchCoins, refetchActiveBet, refetchPendingPoints]);

  const statusText = useMemo(() => {
    if (isConfirming || currentAction) return 'Waiting for on-chain confirmation...';
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
          <div className="relative w-[220px] h-[220px]">
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
              {step === 'choosing' && <button onClick={placeBet} disabled={isButtonDisabled || !hasEnoughCoins} className="btn-cta">Place Bet (1 Coin)</button>}
              {step === 'flipping' && <button onClick={flipCoin} disabled={isButtonDisabled} className="btn-cta success">Flip the Coin</button>}
              {step === 'finished' && ( <> {hasPointsToClaim ? ( <button onClick={claim} disabled={isButtonDisabled} className="btn-cta glow">{`Claim ${Number(pendingPoints)} Points`}</button> ) : ( <button onClick={() => setStep('choosing')} className="btn-cta">Play Again</button> )} </> )}
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
