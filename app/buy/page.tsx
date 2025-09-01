// app/buy/page.tsx 
'use client';

// --- FIX: Added useEffect to the import ---
import { useState, useMemo, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { toast } from 'sonner';

import { chaosCoinAbi } from '@/lib/abi';
import { baseSepolia } from 'wagmi/chains';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;

export default function BuyPage() {
  const { isConnected, address } = useAccount();
  const [amount, setAmount] = useState<string>('100');
  const amountAsNumber = Number(amount) || 0;

  const ethCost = useMemo(() => {
    if (amountAsNumber <= 0) return '0';
    const cost = BigInt(amountAsNumber) * parseEther('0.0001');
    return formatEther(cost);
  }, [amountAsNumber]);

  const { writeContractAsync, data: hash, reset } = useWriteContract(); // --- FIX: Added reset ---
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // This ID will be stored in state so we can update the correct toast
  const [toastId, setToastId] = useState<string | number | undefined>(undefined);

  async function handleBuyCoins() {
    if (!isConnected || !address) { toast.error('Please connect your wallet first.'); return; }
    if (amountAsNumber <= 0) { toast.error('Please enter a valid amount.'); return; }

    const id = toast.loading('Sending transaction...');
    setToastId(id); // --- FIX: Store the toast ID ---

    try {
      const txHash = await writeContractAsync({
        address: HUB_ADDRESS,
        abi: chaosCoinAbi,
        functionName: 'buyCoins',
        args: [BigInt(amountAsNumber)],
        value: parseEther(ethCost),
        chainId: baseSepolia.id,
      });

      // --- FIX: Update the toast message after sending ---
      toast.loading('Waiting for confirmation...', { id });

    } catch (error: any) {
      // --- FIX: Update the toast on failure ---
      const errorMessage = (error as { shortMessage?: string })?.shortMessage || 'Transaction rejected.';
      toast.error(errorMessage, { id });
      setToastId(undefined); // Reset the toast ID
    }
  }
  
  // --- FIX: Moved the success logic into a useEffect hook ---
  useEffect(() => {
    // This effect runs ONLY when isConfirmed changes to true
    if (isConfirmed && toastId) {
      toast.success('Coins purchased successfully!', { id: toastId });
      setToastId(undefined); // Reset the toast ID
      reset(); // Reset the wagmi hook state
    }
  }, [isConfirmed, toastId, reset]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 ring-1 ring-white/5">
        <h1 className="text-3xl font-extrabold text-center">Buy Chaos Coins</h1>
        <p className="mt-2 text-center text-white/60">
          Your universal key to the entire casino. Buy once, play anywhere.
        </p>

        <div className="mt-8">
          <label htmlFor="amount" className="block text-sm font-medium text-white/80">Amount of Coins</label>
          <div className="relative mt-2">
            <input type="number" id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border-white/10 bg-white/5 p-4 pr-24 text-2xl font-semibold outline-none ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white" placeholder="0" min="1"/>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4"><span className="text-xl text-white/40">🪙</span></div>
          </div>
        </div>

        <div className="mt-4 flex justify-between text-sm text-white/70">
          <span>Price: 0.0001 ETH per coin</span>
          <span>Cost: {ethCost} ETH</span>
        </div>

        <div className="mt-8">
          <button onClick={handleBuyCoins} disabled={!isConnected || isConfirming || amountAsNumber <= 0} className="w-full rounded-xl bg-white py-4 text-lg font-bold text-black shadow-[0_10px_40px_rgba(255,255,255,0.15)] transition hover:scale-105 hover:opacity-95 active:scale-100 disabled:cursor-not-allowed disabled:opacity-50">
            {isConfirming ? 'Purchasing...' : `Buy ${amountAsNumber} Coins`}
          </button>
          {!isConnected && (<p className="mt-3 text-center text-xs text-amber-400/80">You must connect your wallet to buy coins.</p>)}
        </div>
      </div>
    </main>
  );
}