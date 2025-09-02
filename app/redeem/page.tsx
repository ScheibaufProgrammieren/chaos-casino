'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';

import { chaosCoinAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export default function RedeemPage() {
  const { isConnected, address } = useAccount();
  const [amount, setAmount] = useState<string>('100');
  const amountAsNumber = Number(amount) || 0;

  const { data: points, refetch: refetchPoints } = useReadContract({
    address: HUB_ADDRESS,
    abi: chaosCoinAbi,
    functionName: 'points',
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !!address },
  });

  const hasEnoughPoints = points ? points >= BigInt(amountAsNumber) : false;

  const { writeContractAsync, data: hash, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
  
  async function handleRedeem() {
    if (!isConnected) { toast.error('Please connect your wallet first.'); return; }
    if (amountAsNumber <= 0) { toast.error('Please enter a valid amount.'); return; }
    if (!hasEnoughPoints) { toast.error('You do not have enough points.'); return; }

    const toastId = toast.loading('Sending transaction...');
    try {
      await writeContractAsync({
        address: HUB_ADDRESS,
        abi: chaosCoinAbi,
        functionName: 'redeemPoints',
        args: [BigInt(amountAsNumber)],
      });
      toast.loading('Waiting for confirmation...', { id: toastId });
    } catch (e) {
      toast.error('Transaction rejected.', { id: toastId });
    }
  }
  
  // --- THIS IS THE FIX ---
  // We put the success logic in a useEffect so it only runs ONCE when isConfirmed changes to true.
  useEffect(() => {
    if (isConfirmed) {
        toast.success('Points redeemed successfully!');
        refetchPoints();
        reset(); // Reset the transaction state
    }
  }, [isConfirmed]); // Dependency array ensures it only runs when isConfirmed changes

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 ring-1 ring-white/5">
        <h1 className="text-3xl font-extrabold text-center">Redeem Points</h1>
        <p className="mt-2 text-center text-white/60">
          Burn your hard-earned points. This is purely for flexing and leaderboards (for now).
        </p>

        <div className="mt-8">
          <label htmlFor="amount" className="block text-sm font-medium text-white/80">Amount of Points to Redeem</label>
          <div className="relative mt-2">
            <input type="number" id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border-white/10 bg-white/5 p-4 pr-24 text-2xl font-semibold outline-none ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white" placeholder="0" min="1"/>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4"><span className="text-xl text-white/40">🔥</span></div>
          </div>
        </div>
        
        <div className="mt-4 text-center text-sm text-white/70">
          Your Points: {points ? points.toString() : '0'}
        </div>

        <div className="mt-8">
          <button onClick={handleRedeem} disabled={!isConnected || isConfirming || amountAsNumber <= 0 || !hasEnoughPoints} className="w-full rounded-xl bg-indigo-600 py-4 text-lg font-bold text-white shadow-[0_10px_40px_rgba(129,140,248,0.25)] transition hover:scale-105 hover:opacity-95 active:scale-100 disabled:cursor-not-allowed disabled:opacity-50">
            {isConfirming ? 'Redeeming...' : `Redeem ${amountAsNumber} Points`}
          </button>
          {!isConnected && (<p className="mt-3 text-center text-xs text-amber-400/80">You must connect your wallet to redeem points.</p>)}
        </div>
      </div>
    </main>
  );
}